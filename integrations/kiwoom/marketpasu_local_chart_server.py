#!/usr/bin/env python3
"""MarketPasu local-only Kiwoom REST price-chart service.

Only serves stock *reference data* to the user's GitHub Pages origin.
Never sends tokens, credentials or account data to the browser.
Runs on 127.0.0.1, not public network. Strict Host+Origin checks defend
against DNS rebinding and cross-site requests. No orders, accounts or trades.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta, date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import argparse
import json
import os
import re
import threading
import time
from urllib.parse import urlsplit, parse_qs

from rest_minutes import (HOSTS, MarketDataError, get_access_token,
                          fetch_minute_rows, ticker_code, request_json,
                          KiwoomTransportError)
from rest_daily import fetch_daily
from existing_rest_auth import ExistingRestAuth

ALLOWED_ORIGIN="https://kimhoonyong.github.io"
MAX_QUERY=65
KST=timezone(timedelta(hours=9))
PORT=8765
LOCAL_API_PROTOCOL="marketpasu-local-v3"
LOCAL_API_VERSION=3
LOCAL_API_ROUTES=("health","symbols","chart","diagnose")
CHART_MINUTE_MAX=8000
SYMBOL_TTL=6*3600

# Strict, known domestic ticker-name pairs. This small reference list is NOT
# presented as the broker's complete or live exchange listing.
KNOWN_SYMBOLS={
    "명신산업":"009900","삼성전자":"005930","SK하이닉스":"000660",
    "NAVER":"035420","현대차":"005380","LG전자":"066570",
}
STAGE_CODES=frozenset(("OAUTH","STOCK_LIST","CHART"))
REASON_CODES=frozenset((
    "HTTP_401","HTTP_403","HTTP_429","HTTP_5XX","HTTP_OTHER",
    "NETWORK_OR_TIMEOUT","INVALID_JSON","PROVIDER_REJECTED",
    "UNEXPECTED_RESPONSE","MISSING_CREDENTIALS",
))


class KiwoomStageFailure(MarketDataError):
    """Whitelist-only failure data. Never forward raw broker messages."""
    def __init__(self,stage,reason):
        self.stage=stage if stage in STAGE_CODES else "STOCK_LIST"
        self.reason=reason if reason in REASON_CODES else "UNEXPECTED_RESPONSE"
        super().__init__("Kiwoom "+self.stage+" request failed")


def stage_failure(stage,error):
    if isinstance(error,KiwoomStageFailure):return error
    if isinstance(error,KiwoomTransportError):
        return KiwoomStageFailure(stage,error.reason)
    if isinstance(error,MarketDataError) and "기존 ThemeManager" in str(error):
        return KiwoomStageFailure(stage,"MISSING_CREDENTIALS")
    return KiwoomStageFailure(stage,"UNEXPECTED_RESPONSE")


def offline_symbols(query):
    q=str(query or "").strip().casefold()
    if not q or len(q)>MAX_QUERY:return []
    return [{"code":code,"name":name,"market":"기본 종목 사전"}
            for name,code in KNOWN_SYMBOLS.items()
            if q==name.casefold() or q==code]



def normalized_symbols(payload):
    if not isinstance(payload,dict) or not isinstance(payload.get("list"),list):
        raise MarketDataError("키움 종목정보 리스트 응답 형식을 확인하세요.")
    out={}
    for record in payload["list"][:15000]:
        if not isinstance(record,dict):
            continue
        code=str(record.get("code","")).strip()
        name=str(record.get("name","")).strip()
        if re.fullmatch(r"\d{6}",code) and 1<=len(name)<=75:
            out[code]={"code":code,"name":name,"market":str(record.get("marketName",""))[:25]}
    return list(out.values())


def stock_catalog(token,*,mode="real",requester=request_json,sleep=time.sleep):
    """Query KOSPI and KOSDAQ via official ka10099. Bounded paging."""
    out={}
    for market in ("0","10"):
        continuation=""
        seen=set()
        for page in range(6):
            payload,meta=requester(HOSTS[mode],"/api/dostk/stkinfo",
                {"mrkt_tp":market},
                {"authorization":"Bearer "+token,"api-id":"ka10099",
                 "cont-yn":"Y" if page else "N","next-key":continuation})
            for row in normalized_symbols(payload):
                out[row["code"]]=row
            key=str(meta.get("next-key",""))
            if str(meta.get("cont-yn","")).upper()!="Y" or not key or key in seen:
                break
            seen.add(key);continuation=key
            if page<5:sleep(.2)
    return sorted(out.values(),key=lambda r:r["name"])


def symbol_search(rows,q,limit=12):
    q=str(q or "").strip().casefold()
    if not q or len(q)>MAX_QUERY:
        return []
    matches=[r for r in rows if q in r["name"].casefold() or q in r["code"]]
    matches.sort(key=lambda x:(0 if x["name"].casefold()==q or x["code"]==q else
                                1 if x["name"].casefold().startswith(q) else 2,
                                len(x["name"]),x["name"]))
    return matches[:limit]


def normalize_minute_rows(rows):
    out=[]
    for x in rows[-CHART_MINUTE_MAX:]:
        try:
            timestamp=datetime.fromisoformat(x["일시"]).isoformat()
            out.append({"time":timestamp,"open":x["시가"],"high":x["고가"],
                        "low":x["저가"],"close":x["종가"],"volume":x["거래량"],
                        "turnover":None,"turnoverVerified":False,
                        "actualBuyVolume":None,"actualSellVolume":None})
        except (KeyError,ValueError,TypeError):
            continue
    return out


def normalize_daily_rows(rows):
    out=[]
    for x in rows[-1200:]:
        try:
            out.append({"date":x["일자"],"open":x["시가"],"high":x["고가"],
                        "low":x["저가"],"close":x["종가"],"volume":x["거래량"],
                        "turnover":x["거래대금"]*1_000_000 if isinstance(x.get("거래대금"),(float,int)) else None,
                        "turnoverVerified":isinstance(x.get("거래대금"),(float,int)),
                        "turnoverSource":"ka10081_trde_prica_KRW_millions"})
        except (KeyError,ValueError,TypeError):
            continue
    return out


class ChartProvider:
    def __init__(self,mode="real",*,clock=time.time,auth=None):
        self.mode=mode
        self.clock=clock
        self._auth=auth if auth is not None else ExistingRestAuth()
        self._cached_access_token=None
        self._access_token_until=0
        self._lock=threading.RLock()
        self._symbols=None
        self._symbols_until=0
        self._chart_cache={}
    def auth_info(self):
        # No token or key fields ever leave this process.
        return {"authConfigured":self._auth.ready(),"authStatus":self._auth.status()}

    def _token(self):
        if self._cached_access_token and self.clock()<self._access_token_until:
            return self._cached_access_token
        credentials=self._auth.credentials()
        if not credentials:
            raise MarketDataError("기존 ThemeManager REST 인증을 확인하지 못했습니다. 로컬 연결 상태를 확인하세요.")
        try:
            fresh=get_access_token(HOSTS[self.mode],credentials)
        except MarketDataError as err:
            raise stage_failure("OAUTH",err) from None
        self._cached_access_token=fresh
        # 12h conservative in-process cache; never write OAuth tokens to disk.
        self._access_token_until=self.clock()+12*3600
        return fresh
    def symbols(self,query):
        shortcut=offline_symbols(query)
        if shortcut:return shortcut
        with self._lock:
            if self._symbols is None or self.clock()>=self._symbols_until:
                token=self._token()
                try:
                    self._symbols=stock_catalog(token,mode=self.mode)
                except MarketDataError as err:
                    raise stage_failure("STOCK_LIST",err) from None
                self._symbols_until=self.clock()+SYMBOL_TTL
            return symbol_search(self._symbols,query)

    def diagnose(self):
        """User-triggered one-call KOSPI catalog test after obtaining token.

        Only stage/reason codes leave the PC; raw responses and credentials do not.
        """
        with self._lock:
            if not self.auth_info()["authConfigured"]:
                return {"state":"FAILED","stage":"OAUTH","reason":"MISSING_CREDENTIALS"}
            try:
                token=self._token()
            except KiwoomStageFailure as err:
                return {"state":"FAILED","stage":err.stage,"reason":err.reason}
            try:
                data,_=request_json(HOSTS[self.mode],"/api/dostk/stkinfo",
                    {"mrkt_tp":"0"},
                    {"authorization":"Bearer "+token,"api-id":"ka10099",
                     "cont-yn":"N","next-key":""})
                if not normalized_symbols(data):
                    return {"state":"FAILED","stage":"STOCK_LIST",
                            "reason":"UNEXPECTED_RESPONSE"}
                return {"state":"OK","stage":"STOCK_LIST",
                        "reason":"VERIFIED_READ_ONLY"}
            except (MarketDataError,ValueError) as err:
                failure=stage_failure("STOCK_LIST",err)
                return {"state":"FAILED","stage":failure.stage,"reason":failure.reason}
            except Exception:
                return {"state":"FAILED","stage":"STOCK_LIST",
                        "reason":"UNEXPECTED_RESPONSE"}
    def chart(self,code,kind,day,exchange="KRX"):
        code=ticker_code(code)
        if exchange not in ("KRX","NXT","SOR"):
            raise ValueError("거래소는 KRX, NXT, SOR만 지원합니다.")
        if self.mode=="demo" and exchange!="KRX":
            raise MarketDataError("모의투자 서버는 KRX만 지원합니다.")
        if kind not in ("daily","minute"):
            raise ValueError("chart kind must be daily or minute")
        try:
            when=date.fromisoformat(day)
        except ValueError as error:
            raise ValueError("date must be YYYY-MM-DD") from error
        if when.isoformat()!=day or when>datetime.now(KST).date():
            raise ValueError("조회일은 한국시간 오늘 또는 과거 날짜여야 합니다.")
        key=(code,kind,day,exchange)
        with self._lock:
            entry=self._chart_cache.get(key)
            # Minute data is refreshed at most once a minute, daily at most once
            # in 10 minutes, to limit consumption and repeat requests.
            if entry and self.clock()-entry[0]<(60 if kind=="minute" else 600):
                return entry[1]
            token=self._token()
            try:
                if kind=="minute":
                    records=fetch_minute_rows(code,when,token,mode=self.mode,pages=12,
                                              exchange=exchange,lookback_calendar_days=21)
                    data=normalize_minute_rows(records)
                else:
                    records=fetch_daily(code,when,token,mode=self.mode,pages=8,exchange=exchange)
                    data=normalize_daily_rows(records)
            except MarketDataError as err:
                raise stage_failure("CHART",err) from None
            # SOR (_AL) is a Kiwoom trading-route code. Neither this API nor
            # a successful request proves a complete KRX+NXT summed tape.
            if not data:
                raise MarketDataError("선택 거래소의 해당 날짜 시세가 없습니다.")
            note=("키움 SOR(_AL) 조회자료입니다. KRX+NXT 통합 거래량으로 검증되지 않았습니다."
                  if exchange=="SOR" else
                  "선택 거래소의 키움 조회자료입니다. 다른 거래소 거래량은 포함되지 않을 수 있습니다.")
            first_date=(data[0].get("date") or data[0].get("time","")[:10])
            last_date=(data[-1].get("date") or data[-1].get("time","")[:10])
            # Make source-limited history visible; this cannot imply complete
            # coverage. Day bars may be stale even with a recent base_dt.
            lag_days=(when-date.fromisoformat(last_date)).days
            result={"code":code,"kind":kind,"asOf":day,"market":exchange,
                    "bars":data,"count":len(data),"source":"Kiwoom REST",
                    "firstAvailableDate":first_date,"lastAvailableDate":last_date,
                    "lastAvailableLagDays":lag_days,
                    "historyScope":"up_to_21_calendar_days_actual_minutes" if kind=="minute" else "up_to_1200_daily_bars",
                    "historyComplete":False,
                    "aggregationVerified":False,
                    "note":note+(" 일봉 거래대금 trde_prica는 백만원 단위를 원으로 변환했습니다."
                          if kind=="daily" else " 분봉 거래대금·매수주도/매도주도 체결량은 ka10080에 없습니다.")}
            self._chart_cache[key]=(self.clock(),result)
            if len(self._chart_cache)>40:
                oldest=min(self._chart_cache,key=lambda k:self._chart_cache[k][0])
                self._chart_cache.pop(oldest,None)
            return result


def handler_factory(provider):
    class LocalHandler(BaseHTTPRequestHandler):
        server_version="MarketPasuReadOnly/1"
        def log_message(self,fmt,*args):
            # No request path or client data logged; avoid leaking interests.
            pass
        def _permitted(self):
            hosts={f"127.0.0.1:{self.server.server_port}",f"localhost:{self.server.server_port}"}
            return self.headers.get("Host","").lower() in hosts and self.headers.get("Origin","")==ALLOWED_ORIGIN
        def _headers(self,status=200):
            self.send_response(status)
            self.send_header("Content-Type","application/json; charset=utf-8")
            self.send_header("Cache-Control","no-store")
            self.send_header("X-Content-Type-Options","nosniff")
            self.send_header("Access-Control-Allow-Origin",ALLOWED_ORIGIN)
            self.send_header("Vary","Origin")
            self.end_headers()
        def _response(self,payload,status=200):
            body=json.dumps(payload,ensure_ascii=False,separators=(",",":")).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type","application/json; charset=utf-8")
            self.send_header("Cache-Control","no-store")
            self.send_header("X-Content-Type-Options","nosniff")
            self.send_header("Access-Control-Allow-Origin",ALLOWED_ORIGIN)
            self.send_header("Vary","Origin")
            self.send_header("Content-Length",str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        def do_OPTIONS(self):
            if not self._permitted() or self.headers.get("Access-Control-Request-Method","GET")!="GET":
                self.send_error(403,"Forbidden")
                return
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin",ALLOWED_ORIGIN)
            self.send_header("Access-Control-Allow-Methods","GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers","Content-Type")
            if self.headers.get("Access-Control-Request-Private-Network","").lower()=="true":
                self.send_header("Access-Control-Allow-Private-Network","true")
            self.send_header("Cache-Control","no-store")
            self.end_headers()
        def do_GET(self):
            if not self._permitted():
                self.send_error(403,"Forbidden")
                return
            try:
                parsed=urlsplit(self.path)
                args=parse_qs(parsed.query,keep_blank_values=True)
                if parsed.path=="/health":
                    self._response({"status":"local_only","origin":ALLOWED_ORIGIN,
                                    "service":"MarketPasu Kiwoom read-only",
                                    "protocol":LOCAL_API_PROTOCOL,
                                    "protocolVersion":LOCAL_API_VERSION,
                                    "routes":list(LOCAL_API_ROUTES),
                                    **provider.auth_info()})
                    return
                if parsed.path=="/diagnose":
                    self._response(provider.diagnose())
                    return
                if parsed.path=="/symbols":
                    q=args.get("q",[""])[0]
                    if len(q)>MAX_QUERY:raise ValueError("검색어가 너무 깁니다.")
                    self._response({"matches":provider.symbols(q),"source":"Kiwoom ka10099"})
                    return
                if parsed.path=="/chart":
                    code=args.get("code",[""])[0]
                    kind=args.get("kind",[""])[0]
                    day=args.get("date",[""])[0]
                    exchange=args.get("exchange",["KRX"])[0]
                    self._response(provider.chart(code,kind,day,exchange=exchange))
                    return
                self._response({"error":"알 수 없는 요청입니다."},404)
            except KiwoomStageFailure as err:
                self._response({"error":"키움 REST 조회 실패 — 안전한 단계별 상태코드를 확인하세요.",
                                "stage":err.stage,"reason":err.reason},422)
            except (ValueError,MarketDataError):
                self._response({"error":"키움 조회에 실패했습니다. 종목·거래일·로컬 연결을 확인하세요."},422)
            except Exception:
                self._response({"error":"로컬 연결 오류입니다. PC 키움 서비스 상태를 확인하세요."},503)
        def do_POST(self):
            self.send_error(405,"Read only")
    return LocalHandler


def main(argv=None):
    parser=argparse.ArgumentParser(description="마켓파수 로컬 키움 주식차트 서비스, 주문/계좌 접근 없음")
    parser.add_argument("--port",type=int,default=PORT)
    parser.add_argument("--mode",choices=tuple(HOSTS),default="real")
    args=parser.parse_args(argv)
    if args.port<1024 or args.port>65535:
        parser.error("포트는 1024~65535이어야 합니다.")
    provider=ChartProvider(mode=args.mode)
    server=ThreadingHTTPServer(("127.0.0.1",args.port),handler_factory(provider))
    print(f"MARKETPASU_KIWOOM_LOCAL: http://127.0.0.1:{args.port}")
    print("ORIGIN: "+ALLOWED_ORIGIN+" / NO_ACCOUNT / NO_ORDERS / NO_PUBLIC_LISTENER")
    print("LOCAL_API_PROTOCOL: "+LOCAL_API_PROTOCOL)
    print("LOCAL_API_ROUTES: "+",".join(LOCAL_API_ROUTES))
    # Report only a fixed, non-sensitive state identifier.
    auth_state=provider.auth_info()
    print("KIWOOM_AUTH: "+("READY_TO_VERIFY" if auth_state["authConfigured"] else "NOT_CONFIGURED"))
    print("KIWOOM_AUTH_SOURCE_STATUS: "+auth_state["authStatus"])
    print("LIVE_KIWOOM_API_REQUESTS_AT_START: 0")
    print("이 창을 닫으면 자동차트 연결도 종료됩니다. 기존 로컬 REST 인증 환경을 사용합니다.")
    try:
        server.serve_forever(poll_interval=.4)
    except KeyboardInterrupt:
        print("MARKETPASU_KIWOOM_LOCAL: STOP")
    finally:
        server.server_close()
    return 0


if __name__=="__main__":
    raise SystemExit(main())
