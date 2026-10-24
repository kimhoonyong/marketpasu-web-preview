import datetime as dt
import pathlib
import sys
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]/"integrations"/"kiwoom"
sys.path.insert(0,str(ROOT))
import rest_minutes as minute
import rest_daily as daily
import marketpasu_local_chart_server as local

D=dt.date(2026,10,23)
def mrec(stamp):
    return {"cntr_tm":stamp,"open_pric":"100","high_pric":"110","low_pric":"99",
            "cur_prc":"105","trde_qty":"100"}
def drec(when):
    return {"dt":when.strftime("%Y%m%d"),"open_pric":"100","high_pric":"110",
            "low_pric":"99","cur_prc":"105","trde_qty":"100","trde_prica":"200"}

class HistoryTests(unittest.TestCase):
    def test_single_day_minute_default_keeps_legacy_behavior(self):
        payload={"stk_min_pole_chart_qry":[mrec("20261021090000"),mrec("20261023090000")]}
        one=minute.decode_minutes(payload,"005930",D)
        self.assertEqual(len(one),1)
    def test_expanded_minute_date_window_keeps_real_previous_days(self):
        payload={"stk_min_pole_chart_qry":[mrec("20261001090000"),mrec("20261020090000"),
                                             mrec("20261023090000"),mrec("20261024090000")]}
        allrows=minute.decode_minutes(payload,"005930",D,D-dt.timedelta(days=20))
        self.assertEqual([v["일시"][:10] for v in allrows],["2026-10-20","2026-10-23"])
    def test_multiple_minute_pages_collect_cross_day_records_in_correct_order(self):
        calls=[]
        def request(*args):
            calls.append(args)
            timestamp="20261023090000" if len(calls)==1 else "20261022090000"
            return {"stk_min_pole_chart_qry":[mrec(timestamp)]},{
                "cont-yn":"Y" if len(calls)==1 else "N",
                "next-key":"n2" if len(calls)==1 else ""}
        rows=minute.fetch_minute_rows("005930",D,"FAKE",pages=12,lookback_calendar_days=21,
                                      requester=request,sleep=lambda _:None)
        self.assertEqual([x["일시"][:10] for x in rows],["2026-10-22","2026-10-23"])
        self.assertEqual(calls[1][3]["next-key"],"n2")
    def test_minute_is_bounded_and_keeps_latest_rows_not_first(self):
        self.assertGreaterEqual(minute.MAX_BARS,8000)
        self.assertGreaterEqual(minute.MAX_PAGES,12)
        with self.assertRaises(minute.MarketDataError):
            minute.fetch_minute_rows("005930",D,"FAKE",lookback_calendar_days=100)
    def test_daily_now_includes_more_than_320_real_bars_when_supplied(self):
        records=[drec(D-dt.timedelta(days=i)) for i in range(600)]
        def request(*_):
            return {"stk_dt_pole_chart_qry":records},{"cont-yn":"N"}
        rows=daily.fetch_daily("005930",D,"FAKE",requester=request)
        self.assertEqual(len(rows),600)
        self.assertEqual(rows[-1]["일자"],D.isoformat())
        self.assertGreaterEqual(daily.MAX_BARS,1200)
    def test_daily_excess_is_trimmed_from_oldest_end(self):
        records=[drec(D-dt.timedelta(days=i)) for i in range(1300)]
        def request(*_):
            return {"stk_dt_pole_chart_qry":records},{"cont-yn":"N"}
        rows=daily.fetch_daily("005930",D,"FAKE",requester=request)
        self.assertEqual(len(rows),1200)
        self.assertEqual(rows[-1]["일자"],D.isoformat())
        self.assertEqual(rows[0]["일자"],(D-dt.timedelta(days=1199)).isoformat())
    def test_local_server_reports_actual_source_span_and_lag_not_claim_complete(self):
        provider=local.ChartProvider()
        rows=[{"일자":"2025-07-02","시가":100,"고가":110,"저가":90,
               "종가":105,"거래량":100,"거래대금":200},
              {"일자":"2025-09-24","시가":100,"고가":110,"저가":90,
               "종가":105,"거래량":100,"거래대금":200}]
        with patch.object(provider,"_token",return_value="FAKE"),\
             patch.object(local,"fetch_daily",return_value=rows) as fake:
            result=provider.chart("005930","daily","2026-10-23")
        self.assertEqual(result["firstAvailableDate"],"2025-07-02")
        self.assertEqual(result["lastAvailableDate"],"2025-09-24")
        self.assertGreater(result["lastAvailableLagDays"],300)
        self.assertFalse(result["historyComplete"])
        self.assertEqual(fake.call_args.kwargs["pages"],8)
    def test_multi_day_local_request_is_capped_and_market_specific(self):
        provider=local.ChartProvider()
        data=[{"일시":"2026-10-22T09:00:00+09:00","시가":100,"고가":110,"저가":99,
               "종가":105,"거래량":100},
              {"일시":"2026-10-23T09:00:00+09:00","시가":100,"고가":110,"저가":99,
               "종가":105,"거래량":100}]
        with patch.object(provider,"_token",return_value="FAKE"),\
             patch.object(local,"fetch_minute_rows",return_value=data) as fake:
            result=provider.chart("005930","minute","2026-10-23","NXT")
        self.assertEqual(result["count"],2)
        self.assertEqual(result["market"],"NXT")
        self.assertEqual(result["firstAvailableDate"],"2026-10-22")
        self.assertEqual(result["lastAvailableDate"],"2026-10-23")
        self.assertEqual(fake.call_args.kwargs["pages"],12)
        self.assertEqual(fake.call_args.kwargs["lookback_calendar_days"],21)

if __name__=="__main__":unittest.main()
