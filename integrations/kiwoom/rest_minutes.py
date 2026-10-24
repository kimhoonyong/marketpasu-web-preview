#!/usr/bin/env python3
"""Read-only Kiwoom REST 1-minute KRX bars -> MarketPasu-compatible local CSV.

Local PC only. This script never sends brokerage keys, tokens, order requests,
account numbers, or market-bar data to GitHub/Firebase/Telegram.
Supported: ka10080 /api/dostk/chart. No fabricated turnover or buy/sell side.
Real authenticated requests require an already available token or app key/secret
through the LOCAL process environment, never command-line arguments.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

KST = dt.timezone(dt.timedelta(hours=9))
HOSTS = {"real": "https://api.kiwoom.com", "demo": "https://mockapi.kiwoom.com"}
API_ID = "ka10080"
PATH = "/api/dostk/chart"
MAX_PAGES = 3
RECORD_KEY = "stk_min_pole_chart_qry"
HEADINGS = ["일시", "종목코드", "시가", "고가", "저가", "종가", "거래량",
            "거래대금", "매수주도체결량", "매도주도체결량"]


class MarketDataError(Exception):
    """Expected, safely redacted REST or data validation failure."""


def ticker_code(value: str) -> str:
    value = value.strip().upper().removeprefix("A")
    if not re.fullmatch(r"\d{6}", value):
        raise MarketDataError("국내주식 KRX 6자리 종목코드를 입력하세요. (예: 005930)")
    return value


# Kiwoom official ka10080 expects exchange-scoped stock codes:
# KRX 005930 / NXT 005930_NX / SOR 005930_AL.
# SOR is order routing, NOT proof that all venues' volumes are aggregated.
EXCHANGE_CODES={"KRX":"","NXT":"_NX","SOR":"_AL"}


def exchange_stock_code(ticker: str, exchange: str="KRX") -> str:
    base=ticker_code(ticker)
    if exchange not in EXCHANGE_CODES:
        raise MarketDataError("지원되지 않는 거래소입니다. KRX, NXT, SOR만 선택할 수 있습니다.")
    return base+EXCHANGE_CODES[exchange]


def local_minute(value: str) -> str:
    """Return a time-zone-aware KST ISO minute string from Kiwoom cntr_tm."""
    if not isinstance(value, str) or not re.fullmatch(r"\d{12}(?:\d{2})?", value):
        raise MarketDataError("키움 체결시각 형식이 맞지 않습니다.")
    try:
        parsed = dt.datetime.strptime(value[:12], "%Y%m%d%H%M").replace(tzinfo=KST)
    except ValueError as err:
        raise MarketDataError("키움 체결시각을 변환할 수 없습니다.") from err
    return parsed.strftime("%Y-%m-%dT%H:%M:00+09:00")


def positive_price(value: object) -> int:
    """Kiwoom signed prices may indicate direction, not negative share prices."""
    try:
        n = int(str(value).replace(",", "").strip())
    except (TypeError, ValueError) as err:
        raise MarketDataError("키움 분봉 가격을 숫자로 변환할 수 없습니다.") from err
    if n == 0:
        raise MarketDataError("0원 가격은 유효하지 않습니다.")
    return abs(n)


def nonnegative_qty(value: object) -> int:
    try:
        n = int(str(value).replace(",", "").strip())
    except (TypeError, ValueError) as err:
        raise MarketDataError("키움 분봉 거래량을 숫자로 변환할 수 없습니다.") from err
    if n < 0:
        raise MarketDataError("음수 분봉 거래량은 사용할 수 없습니다.")
    return n


def decode_minutes(payload: dict, ticker: str, trading_date: dt.date) -> list[dict]:
    if not isinstance(payload, dict) or not isinstance(payload.get(RECORD_KEY), list):
        raise MarketDataError("키움 ka10080 분봉 응답 배열이 없습니다.")
    rows = []
    for item in payload[RECORD_KEY]:
        if not isinstance(item, dict):
            continue
        try:
            timestamp = local_minute(str(item.get("cntr_tm", "")))
            if dt.date.fromisoformat(timestamp[:10]) != trading_date:
                continue
            o, h, l, c = (positive_price(item.get(field)) for field in
                           ("open_pric", "high_pric", "low_pric", "cur_prc"))
            qty = nonnegative_qty(item.get("trde_qty"))
            # Exchange market data occasionally encodes signed prices. Respect
            # actual OHLC ordering after abs(); silently discard broken bars.
            if h < max(o, c) or l > min(o, c) or l > h:
                continue
            rows.append({"일시": timestamp, "종목코드": ticker, "시가": o,
                         "고가": h, "저가": l, "종가": c, "거래량": qty,
                         "거래대금": "", "매수주도체결량": "", "매도주도체결량": ""})
        except MarketDataError:
            continue
    return rows


def request_json(base_url: str, path: str, body: dict, headers: dict,
                 opener=urllib.request.urlopen) -> tuple[dict, dict]:
    request = urllib.request.Request(
        base_url + path,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json;charset=UTF-8", **headers},
        method="POST",
    )
    try:
        with opener(request, timeout=10) as response:
            raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise MarketDataError("키움 응답 크기 제한을 초과했습니다.")
            response_headers = {k.lower(): v for k, v in response.headers.items()}
    except (urllib.error.URLError, TimeoutError) as err:
        raise MarketDataError("키움 API 통신에 실패했습니다. PC 로그인·네트워크 상태를 확인하세요.") from err
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as err:
        raise MarketDataError("키움 API 응답이 올바른 JSON이 아닙니다.") from err
    if not isinstance(data, dict):
        raise MarketDataError("키움 API 응답이 객체가 아닙니다.")
    if data.get("return_code") not in (None, 0):
        # Do not surface the server's arbitrary messages; they may echo secrets.
        raise MarketDataError("키움 API 처리 결과를 확인해야 합니다. (코드: " +
                              str(data["return_code"])[:12] + ")")
    return data, response_headers


def get_access_token(base_url: str, env: dict, requester=request_json) -> str:
    token = env.get("KIWOOM_ACCESS_TOKEN", "").strip()
    if token:
        return token
    key = env.get("KIWOOM_APP_KEY", "").strip()
    secret = env.get("KIWOOM_APP_SECRET", "").strip()
    if not key or not secret:
        raise MarketDataError(
            "이 PC에 기존 키움 REST 인증정보를 사용하는 연결이 필요합니다. "
            "KIWOOM_ACCESS_TOKEN 또는 KIWOOM_APP_KEY/KIWOOM_APP_SECRET을 "
            "로컬 프로세스 환경에 연결하세요. 키를 채팅이나 GitHub에 올리지 마세요."
        )
    response, _ = requester(base_url, "/oauth2/token",
                            {"grant_type": "client_credentials",
                             "appkey": key, "secretkey": secret}, {})
    token = response.get("token") or response.get("access_token")
    if not isinstance(token, str) or not token.strip():
        raise MarketDataError("키움 OAuth 토큰 발급에 실패했습니다.")
    return token.strip()


def fetch_minute_rows(ticker: str, trading_date: dt.date, token: str,
                      *, mode="real", pages=MAX_PAGES, requester=request_json,
                      sleep=time.sleep, exchange="KRX") -> list[dict]:
    if mode not in HOSTS:
        raise MarketDataError("키움 서버 유형은 real 또는 demo만 지원합니다.")
    code = ticker_code(ticker)
    provider_code = exchange_stock_code(code, exchange)
    if not token:
        raise MarketDataError("키움 REST 액세스 토큰이 없습니다.")
    if not (1 <= pages <= MAX_PAGES):
        raise MarketDataError("요청 페이지는 1~3만 지원합니다.")
    result = []
    next_key = ""
    seen_keys = set()
    for page in range(pages):
        headers = {"authorization": "Bearer " + token,
                   "api-id": API_ID,
                   "cont-yn": "Y" if page else "N",
                   "next-key": next_key}
        body = {"stk_cd": provider_code, "tic_scope": "1", "upd_stkpc_tp": "1",
                "base_dt": trading_date.strftime("%Y%m%d")}
        response, meta = requester(HOSTS[mode], PATH, body, headers)
        result.extend(decode_minutes(response, code, trading_date))
        continued = (meta.get("cont-yn", "").upper() == "Y")
        new_key = meta.get("next-key", "")
        if not continued or not new_key or new_key in seen_keys:
            break
        seen_keys.add(new_key)
        next_key = new_key
        if page + 1 < pages:
            sleep(0.25)
    # Distinct minutes; prefer the most recent response if duplicated.
    dedup = {item["일시"]: item for item in result}
    return [dedup[k] for k in sorted(dedup)]


def default_output() -> pathlib.Path:
    folder = pathlib.Path(os.environ.get("LOCALAPPDATA") or pathlib.Path.home()) / "MarketPasu" / "kiwoom_minutes"
    return folder


def write_csv(rows: list[dict], path: pathlib.Path) -> None:
    if not rows:
        raise MarketDataError("해당 일자에 유효한 1분봉이 없습니다. 장 휴장·종목·기준일을 확인하세요.")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".csv.tmp")
    try:
        with temporary.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=HEADINGS)
            writer.writeheader()
            writer.writerows(rows)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="키움 REST 1분봉을 개인 PC의 마켓파수 CSV로 변환")
    parser.add_argument("--ticker", required=True, help="국내주식 KRX 종목코드 6자리")
    parser.add_argument("--date", help="거래일 YYYY-MM-DD (기본: 오늘 한국시간)")
    parser.add_argument("--mode", choices=["real", "demo"], default="real")
    parser.add_argument("--pages", type=int, default=MAX_PAGES, choices=[1, 2, 3])
    args = parser.parse_args(argv)
    try:
        code = ticker_code(args.ticker)
        day = dt.date.fromisoformat(args.date) if args.date else dt.datetime.now(KST).date()
        if day > dt.datetime.now(KST).date():
            raise MarketDataError("미래 일자의 분봉은 조회하지 않습니다.")
        token = get_access_token(HOSTS[args.mode], os.environ)
        rows = fetch_minute_rows(code, day, token, mode=args.mode, pages=args.pages)
        output = default_output() / f"{code}_{day.isoformat()}_1m.csv"
        write_csv(rows, output)
        print(f"KIWOOM_MINUTE_EXPORT: SUCCESS ticker={code} date={day} bars={len(rows)}")
        print(f"LOCAL_CSV: {output}")
        print("거래대금·매수/매도 주도 체결량은 ka10080만으로 확정할 수 없어 빈칸으로 두었습니다.")
        return 0
    except (MarketDataError, ValueError) as err:
        print("KIWOOM_MINUTE_EXPORT: FAILED " + str(err), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
