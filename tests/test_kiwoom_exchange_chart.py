import datetime as dt
import pathlib
import sys
import unittest
from unittest.mock import patch

PATH=pathlib.Path(__file__).resolve().parents[1]/"integrations"/"kiwoom"
sys.path.insert(0,str(PATH))
import rest_minutes as minute
import rest_daily as daily
import marketpasu_local_chart_server as local

DATE=dt.date(2026,10,23)


class ExchangeTests(unittest.TestCase):
    def test_official_market_suffixes_do_not_conflate_routes(self):
        self.assertEqual(minute.exchange_stock_code("005930","KRX"),"005930")
        self.assertEqual(minute.exchange_stock_code("005930","NXT"),"005930_NX")
        self.assertEqual(minute.exchange_stock_code("005930","SOR"),"005930_AL")
    def test_injection_or_unrecognized_exchange_rejected(self):
        for exchange in ("both","total","", "NXT;DROP", "nxt"):
            with self.assertRaises(minute.MarketDataError):
                minute.exchange_stock_code("005930",exchange)
        with self.assertRaises(minute.MarketDataError):
            minute.exchange_stock_code("005930_NX","KRX")
    def test_ka10080_passes_suffix_exactly_and_preserves_base_ticker(self):
        seen=[]
        def request(*args):
            seen.append(args)
            return {"stk_min_pole_chart_qry":[{
                "cntr_tm":"20261023170000","cur_prc":"-100","open_pric":"-100",
                "high_pric":"-110","low_pric":"-99","trde_qty":"100"
            }]},{"cont-yn":"N"}
        result=minute.fetch_minute_rows("005930",DATE,"FAKE",exchange="NXT",requester=request)
        self.assertEqual(seen[0][2]["stk_cd"],"005930_NX")
        self.assertEqual(seen[0][3]["api-id"],"ka10080")
        self.assertEqual(result[0]["종목코드"],"005930")
    def test_ka10081_requests_provider_market_suffix_and_pages_above_240(self):
        called=[]
        day=dt.date(2026,10,23)
        def request(*args):
            called.append(args)
            day_str=(day-dt.timedelta(days=len(called))).strftime("%Y%m%d")
            return {"stk_dt_pole_chart_qry":[{
                "dt":day_str,"open_pric":"100","high_pric":"110","low_pric":"99",
                "cur_prc":"105","trde_qty":"123","trde_prica":"456"
            }]},{"cont-yn":"N"}
        result=daily.fetch_daily("005930",DATE,"FAKE",exchange="SOR",requester=request)
        self.assertEqual(len(result),1)
        self.assertEqual(called[0][2]["stk_cd"],"005930_AL")
        self.assertEqual(called[0][3]["api-id"],"ka10081")
        self.assertGreaterEqual(daily.MAX_BARS,260)
        self.assertGreaterEqual(daily.MAX_PAGES,3)
    def test_chart_market_cache_is_separated(self):
        auth=type("Auth",(),{"credentials":lambda _:{"KIWOOM_ACCESS_TOKEN":"FAKE"}})()
        provider=local.ChartProvider(auth=auth)
        day="2026-10-23"
        fake=[{"일시":"2026-10-23T09:00:00+09:00","시가":100,
               "고가":110,"저가":99,"종가":105,"거래량":100}]
        with patch.object(provider,"_token",return_value="FAKE"),\
             patch.object(local,"fetch_minute_rows",return_value=fake) as fetched:
            a=provider.chart("005930","minute",day,"KRX")
            b=provider.chart("005930","minute",day,"NXT")
            c=provider.chart("005930","minute",day,"SOR")
            d=provider.chart("005930","minute",day,"KRX")
        self.assertEqual(fetched.call_count,3)
        self.assertEqual([a["market"],b["market"],c["market"],d["market"]],
                         ["KRX","NXT","SOR","KRX"])
        self.assertFalse(c["aggregationVerified"])
        self.assertIn("검증되지",c["note"])
        self.assertEqual(fetched.call_args_list[1].kwargs["exchange"],"NXT")
    def test_missing_nxt_data_cannot_fallback_to_krx(self):
        provider=local.ChartProvider()
        with patch.object(provider,"_token",return_value="FAKE"),\
             patch.object(local,"fetch_minute_rows",return_value=[]):
            with self.assertRaises(local.MarketDataError):
                provider.chart("005930","minute","2026-10-23","NXT")
    def test_simulated_exchange_is_krx_only(self):
        provider=local.ChartProvider(mode="demo")
        with self.assertRaises(local.MarketDataError):
            provider.chart("005930","minute","2026-10-23","NXT")
    def test_no_fabricated_krx_nxt_aggregate(self):
        provider=local.ChartProvider()
        fake=[{"일시":"2026-10-23T09:00:00+09:00","시가":100,
               "고가":110,"저가":99,"종가":105,"거래량":100}]
        with patch.object(provider,"_token",return_value="FAKE"),\
             patch.object(local,"fetch_minute_rows",return_value=fake):
            r=provider.chart("005930","minute","2026-10-23","SOR")
        self.assertEqual(r["bars"][0]["volume"],100)
        self.assertFalse(r["aggregationVerified"])
        self.assertNotIn("KRX+NXT 전체 검증됨",r["note"])

if __name__=="__main__":
    unittest.main()
