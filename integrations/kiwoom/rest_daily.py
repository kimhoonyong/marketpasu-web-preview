#!/usr/bin/env python3
"""Kiwoom REST ka10081 read-only day-bar exporter for MarketPasu.

Local Windows use; existing app key/token credentials remain on the PC.
No order API, no Firebase/GitHub upload. Historical corporate actions still
need human verification; 1-minute market data cannot replace this daily view.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
from pathlib import Path
import sys
import time

from rest_minutes import (
    KST, HOSTS, MarketDataError, default_output, get_access_token,
    nonnegative_qty, positive_price, request_json, ticker_code, exchange_stock_code,
)

API_ID="ka10081"
RECORDS="stk_dt_pole_chart_qry"
COLUMNS=["일자","종목코드","시가","고가","저가","종가","거래량","거래대금"]
MAX_PAGES=8
MAX_BARS=1200


def read_daily(response:dict,ticker:str,base_date:dt.date)->list[dict]:
    raw=response.get(RECORDS)
    if not isinstance(raw,list):
        raise MarketDataError("키움 ka10081 일봉 데이터 배열이 없습니다.")
    data=[]
    for item in raw:
        if not isinstance(item,dict):continue
        try:
            d=dt.datetime.strptime(str(item.get("dt","")),"%Y%m%d").date()
            if d>base_date:continue
            o,h,l,c=[positive_price(item.get(k)) for k in
                       ("open_pric","high_pric","low_pric","cur_prc")]
            volume=nonnegative_qty(item.get("trde_qty"))
            if h<max(o,c) or l>min(o,c) or l>h:continue
            cash=item.get("trde_prica")
            try:turnover=nonnegative_qty(cash) if cash is not None and str(cash).strip() else ""
            except MarketDataError:turnover=""
            data.append({"일자":d.isoformat(),"종목코드":ticker,"시가":o,"고가":h,
                         "저가":l,"종가":c,"거래량":volume,"거래대금":turnover})
        except (MarketDataError,ValueError):
            continue
    return data


def fetch_daily(ticker:str,asof:dt.date,token:str,*,mode="real",
                pages=MAX_PAGES,requester=request_json,sleep=time.sleep,exchange="KRX")->list[dict]:
    ticker=ticker_code(ticker)
    provider_code=exchange_stock_code(ticker,exchange)
    if mode not in HOSTS or not token or not(1<=pages<=MAX_PAGES):
        raise MarketDataError("서버·토큰·페이지 설정이 유효하지 않습니다.")
    continuation=""
    keys=set()
    rows=[]
    for page in range(pages):
        response,meta=requester(HOSTS[mode],"/api/dostk/chart",
            {"stk_cd":provider_code,"base_dt":asof.strftime("%Y%m%d"),"upd_stkpc_tp":"1"},
            {"authorization":"Bearer "+token,"api-id":API_ID,
             "cont-yn":"N" if page==0 else "Y","next-key":continuation})
        rows.extend(read_daily(response,ticker,asof))
        token_next=meta.get("next-key","")
        if meta.get("cont-yn","").upper()!="Y" or not token_next or token_next in keys:
            break
        keys.add(token_next)
        continuation=token_next
        if page+1<pages:sleep(.25)
    # Always keep the MOST RECENT requested bars when the provider returns
    # more rows than our bounded window. Never prefer an older page.
    dedup={item["일자"]:item for item in rows}
    latest=sorted(dedup,reverse=True)[:MAX_BARS]
    return [dedup[k] for k in reversed(latest)]


def write_daily_csv(rows:list[dict],target:Path)->None:
    if not rows:raise MarketDataError("해당 종목의 일봉 데이터가 없습니다.")
    target.parent.mkdir(parents=True,exist_ok=True)
    temp=target.with_suffix(".csv.tmp")
    try:
        with temp.open("w",encoding="utf-8-sig",newline="") as f:
            w=csv.DictWriter(f,fieldnames=COLUMNS)
            w.writeheader()
            w.writerows(rows)
        temp.replace(target)
    finally:
        temp.unlink(missing_ok=True)


def main(argv=None)->int:
    p=argparse.ArgumentParser(description="키움 REST 일봉(ka10081) 읽기 전용 CSV 생성")
    p.add_argument("--ticker",required=True)
    p.add_argument("--date",help="기준일 YYYY-MM-DD, 기본 한국시간 오늘")
    p.add_argument("--mode",choices=("real","demo"),default="real")
    args=p.parse_args(argv)
    try:
        ticker=ticker_code(args.ticker)
        date=dt.date.fromisoformat(args.date) if args.date else dt.datetime.now(KST).date()
        if date>dt.datetime.now(KST).date():
            raise MarketDataError("미래 일자 데이터를 조회할 수 없습니다.")
        token=get_access_token(HOSTS[args.mode],__import__("os").environ)
        rows=fetch_daily(ticker,date,token,mode=args.mode)
        output=default_output()/f"{ticker}_{date.isoformat()}_DAILY.csv"
        write_daily_csv(rows,output)
        print("KIWOOM_DAILY_EXPORT: PASS")
        print(f"TICKER: {ticker}")
        print(f"DAILY_ROWS: {len(rows)}")
        print(f"LOCAL_CSV: {output}")
        print("ADJUSTED_REQUESTED: YES. Verify stock splits, rights and continuity separately.")
        print("TURNOVER_UNIT: provider field trde_prica; unit must be independently verified.")
        return 0
    except (MarketDataError,ValueError) as error:
        print("KIWOOM_DAILY_EXPORT: FAILED "+str(error),file=sys.stderr)
        return 2


if __name__=="__main__":
    raise SystemExit(main())
