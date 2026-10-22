#!/usr/bin/env python3
"""Kiwoom 0B tick OBSERVATION converter. Offline and read-only.

Official realtime API 0B FIDs: 20=HHMMSS exchange execution time,
10=current trade price, 15=executed quantity, 1315=sell single tick,
1316=buy single tick. Do not confuse fields 1030/1031 (potentially
cumulative executed volume) with trade-by-trade quantities.
No ownership or actual institutional netbuy can be inferred.
No assumption of complete market coverage; a dropped/replayed tick can
change observed totals. This OBSERVATION output is intentionally NOT an
OHLC market minute CSV accepted as a complete minute data source.
"""
from __future__ import annotations

import argparse
import csv
from datetime import date, datetime, time, timedelta, timezone
import json
from pathlib import Path
import re
import sys

KST=timezone(timedelta(hours=9))
LIMIT_BYTES=8_000_000
LIMIT_LINES=30000
TICK_HEADERS=["체결시각","종목코드","체결가","관측체결수량","관측체결대금_계산치",
              "매수주도체결_단건관측","매도주도체결_단건관측","관측시각근거","출처형식"]
MINUTE_HEADERS=["분시각","종목코드","관측체결건수","관측체결수량합계",
                "관측체결대금합계_계산치","매수주도체결_관측합계",
                "매도주도체결_관측합계","관측자료_완전성"]


def positive_int(value):
    if not isinstance(value,(str,int)) or not re.fullmatch(r"[+-]?\d+",str(value).strip()):
        return None
    n=abs(int(value))
    return n if n>0 else None


def nonnegative_int(value):
    if not isinstance(value,(str,int)) or not re.fullmatch(r"[+-]?\d+",str(value).strip()):
        return None
    n=int(value)
    return n if n>=0 else None


def parse_receive_timestamp(value):
    if not isinstance(value,str) or not re.search(r"(Z|[+-]\d\d:\d\d)$",value):
        return None
    try:
        d=datetime.fromisoformat(value.replace("Z","+00:00"))
        return d.astimezone(KST)
    except ValueError:
        return None


def extract_entries(frame):
    if not isinstance(frame,dict):return []
    container=frame.get("message",frame)
    if not isinstance(container,dict):return []
    if container.get("trnm","REAL")!="REAL":return []
    data=container.get("data",[])
    if isinstance(data,dict):data=[data]
    if not isinstance(data,list):return []
    return [v for v in data if isinstance(v,dict) and str(v.get("type"))=="0B"]


def decode_tick(entry, *,received_at=None,assumed_date:date|None=None,ticker=None):
    code=str(entry.get("item","")).strip().upper()
    if code.startswith("A") and re.fullmatch(r"A\d{6}",code):code=code[1:]
    # This adapter only accepts the exact 6-digit KRX market identifier.
    if not re.fullmatch(r"\d{6}",code):return None
    if ticker and code!=ticker:return None
    vals=entry.get("values")
    if not isinstance(vals,dict):return None
    clock=str(vals.get("20","")).strip()
    if not re.fullmatch(r"\d{6}",clock):return None
    hh,mm,ss=int(clock[:2]),int(clock[2:4]),int(clock[4:])
    if hh>23 or mm>59 or ss>59:return None
    received=parse_receive_timestamp(received_at)
    if received:
        day=received.date()
        time_source="capture_received_at"
    elif assumed_date:
        day=assumed_date
        time_source="user_supplied_date_unverified"
    else:
        return None
    try:ts=datetime.combine(day,time(hh,mm,ss),tzinfo=KST)
    except ValueError:return None
    if received and abs((ts-received).total_seconds())>300:
        # Reject ambiguous date/time mismatches and delayed/replayed messages.
        return None
    price=positive_int(vals.get("10"))
    size=positive_int(vals.get("15"))
    if not price or not size:return None
    buy=nonnegative_int(vals.get("1316"))
    sell=nonnegative_int(vals.get("1315"))
    # Only if both single-execution fields exist and agree with observed size.
    if buy is None or sell is None or buy+sell>size:
        buy=sell=None
    return {"체결시각":ts.isoformat(),"종목코드":code,"체결가":price,
            "관측체결수량":size,"관측체결대금_계산치":price*size,
            "매수주도체결_단건관측":"" if buy is None else buy,
            "매도주도체결_단건관측":"" if sell is None else sell,
            "관측시각근거":time_source,"출처형식":"kiwoom_REST_0B_raw"}


def convert_jsonl(lines,*,assumed_date:date|None=None,ticker=None):
    if ticker and not re.fullmatch(r"\d{6}",ticker):
        raise ValueError("KRX 6자리 종목코드만 지정할 수 있습니다.")
    collected=[]
    rejected=0
    for n,line in enumerate(lines):
        if n>=LIMIT_LINES:raise ValueError("수집 기록은 최대 30000줄까지만 처리합니다.")
        if not line.strip():continue
        try:frame=json.loads(line)
        except (ValueError,TypeError):rejected+=1;continue
        capture=frame.get("received_at") or frame.get("captured_at") or frame.get("timestamp") if isinstance(frame,dict) else None
        for entry in extract_entries(frame):
            rec=decode_tick(entry,received_at=entry.get("received_at") or capture,
                            assumed_date=assumed_date,ticker=ticker)
            if rec:collected.append(rec)
            else:rejected+=1
    return collected,rejected


def summarise_observed_minutes(ticks):
    # An observed subset, not proof of all trades or complete OHLCV coverage.
    rows={}
    for t in ticks:
        key=(t["종목코드"],t["체결시각"][:16])
        if key not in rows:
            rows[key]={"분시각":t["체결시각"][:16]+":00",
                       "종목코드":t["종목코드"],"관측체결건수":0,
                       "관측체결수량합계":0,"관측체결대금합계_계산치":0,
                       "매수주도체결_관측합계":0,"매도주도체결_관측합계":0,
                       "관측자료_완전성":"부분관측_시장전체검증안됨"}
        group=rows[key]
        group["관측체결건수"]+=1
        group["관측체결수량합계"]+=t["관측체결수량"]
        group["관측체결대금합계_계산치"]+=t["관측체결대금_계산치"]
        for key2 in ("매수주도체결_단건관측","매도주도체결_단건관측"):
            if isinstance(t[key2],int):
                out="매수주도체결_관측합계" if key2.startswith("매수") else "매도주도체결_관측합계"
                group[out]+=t[key2]
    return [rows[key] for key in sorted(rows)]


def write_output(records,path,headings):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+".tmp")
    try:
        with temp.open("w",encoding="utf-8-sig",newline="") as output:
            writer=csv.DictWriter(output,fieldnames=headings)
            writer.writeheader()
            writer.writerows(records)
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def main(argv=None):
    ap=argparse.ArgumentParser(description="키움 0B 로컬 체결 로그를 부분관측 참고 자료로 변환")
    ap.add_argument("--input",required=True,help="기존 키움 프로그램의 0B JSONL 로그")
    ap.add_argument("--ticker",required=True,help="6자리 KRX 코드")
    ap.add_argument("--date",help="로그에 수신시각이 없다면 거래일 YYYY-MM-DD. 날짜는 검증되지 않음.")
    ap.add_argument("--out",help="출력 폴더 (기본: 입력 로그와 별도 observations 폴더)")
    args=ap.parse_args(argv)
    try:
        path=Path(args.input).expanduser()
        if not path.is_file() or path.stat().st_size>LIMIT_BYTES:
            raise ValueError("8MB 이하의 기존 로컬 0B JSONL 로그 파일이 필요합니다.")
        with path.open("r",encoding="utf-8-sig") as f:
            ticks,rejected=convert_jsonl(f,assumed_date=date.fromisoformat(args.date) if args.date else None,ticker=args.ticker)
        if not ticks:raise ValueError("검증 가능한 0B 체결표본이 없습니다. 메시지 형식과 수신시각을 확인하세요.")
        output=Path(args.out).expanduser() if args.out else path.parent/"marketpasu_observations"
        label=ticks[0]["체결시각"][:10]
        stem=f"{args.ticker}_{label}"
        write_output(ticks,output/(stem+"_TICK_OBSERVED.csv"),TICK_HEADERS)
        minute=summarise_observed_minutes(ticks)
        write_output(minute,output/(stem+"_MINUTE_OBSERVED_ONLY.csv"),MINUTE_HEADERS)
        print("KIWOOM_0B_OBSERVATION: PASS")
        print(f"TICK_SAMPLES: {len(ticks)}")
        print(f"MINUTE_SAMPLES: {len(minute)}")
        print(f"REJECTED_ENTRIES: {rejected}")
        print(f"OUTPUT_FOLDER: {output}")
        print("OBSERVED_ONLY: NOT_VERIFIED_MARKET_FULL_VOLUME / NOT_INSTITUTION_NETBUY")
        return 0
    except (ValueError,OSError,UnicodeError) as error:
        print("KIWOOM_0B_OBSERVATION: FAIL",str(error),file=sys.stderr)
        return 2


if __name__=="__main__":
    raise SystemExit(main())
