import datetime as dt
import importlib.util
import pathlib
import sys
import tempfile
import unittest

DIR=pathlib.Path(__file__).resolve().parents[1]/"integrations"/"kiwoom"
sys.path.insert(0,str(DIR))
spec=importlib.util.spec_from_file_location("marketpasu_kiwoom_daily",DIR/"rest_daily.py")
daily=importlib.util.module_from_spec(spec)
spec.loader.exec_module(daily)
DATE=dt.date(2026,10,22)


def rec(date="20261021",close="-110",turnover="345678"):
    return {"dt":date,"open_pric":"-100","high_pric":"-120",
            "low_pric":"-95","cur_prc":close,"trde_qty":"20000","trde_prica":turnover}


class DailyApiTests(unittest.TestCase):
    def test_official_ka10081_response_and_units_unmodified(self):
        out=daily.read_daily({"stk_dt_pole_chart_qry":[rec()]},"005930",DATE)
        self.assertEqual(len(out),1)
        self.assertEqual(out[0]["종가"],110)
        self.assertEqual(out[0]["시가"],100)
        self.assertEqual(out[0]["거래대금"],345678)
        self.assertEqual(out[0]["일자"],"2026-10-21")

    def test_excludes_future_date_bad_candle_and_invalid_row(self):
        rows=[rec(date="20261023"),rec(date="20261020",close="0"),
              rec(date="20261019"),rec(date="bad")]
        valid=daily.read_daily({"stk_dt_pole_chart_qry":rows},"005930",DATE)
        self.assertEqual(len(valid),1)
        self.assertEqual(valid[0]["일자"],"2026-10-19")

    def test_absent_turnover_stays_absent_not_guessed(self):
        row=rec()
        row.pop("trde_prica")
        out=daily.read_daily({"stk_dt_pole_chart_qry":[row]},"005930",DATE)
        self.assertEqual(out[0]["거래대금"],"")

    def test_invalid_response_shape_is_rejected(self):
        with self.assertRaises(daily.MarketDataError):
            daily.read_daily({"not_daily":[]},"005930",DATE)

    def test_request_uses_official_id_and_adjusted_prices_without_order_routes(self):
        seen=[]
        def requester(base,path,body,headers):
            seen.append((base,path,body,headers))
            return {"stk_dt_pole_chart_qry":[rec()],"return_code":0},{"cont-yn":"N"}
        out=daily.fetch_daily("005930",DATE,"dummy",requester=requester)
        self.assertEqual(len(out),1)
        self.assertEqual(seen[0][1],"/api/dostk/chart")
        self.assertEqual(seen[0][3]["api-id"],"ka10081")
        self.assertEqual(seen[0][2]["upd_stkpc_tp"],"1")
        self.assertEqual(seen[0][2]["base_dt"],"20261022")

    def test_uses_bounded_pagination_and_de_duplicates_dates(self):
        count=0
        def requester(*args):
            nonlocal count
            count+=1
            return {"return_code":0,"stk_dt_pole_chart_qry":[rec()]},{
                "cont-yn":"Y","next-key":"next1"
            }
        out=daily.fetch_daily("005930",DATE,"dummy",requester=requester,sleep=lambda _:None)
        self.assertEqual(count,2)
        self.assertEqual(len(out),1)

    def test_empty_response_does_not_overwrite_existing_csv(self):
        with tempfile.TemporaryDirectory() as folder:
            target=pathlib.Path(folder)/"old.csv"
            target.write_text("ORIGINAL",encoding="utf-8")
            with self.assertRaises(daily.MarketDataError):
                daily.write_daily_csv([],target)
            self.assertEqual(target.read_text(encoding="utf-8"),"ORIGINAL")

    def test_csv_is_importable_by_browser_and_no_sensitive_data_is_written(self):
        with tempfile.TemporaryDirectory() as folder:
            target=pathlib.Path(folder)/"daily.csv"
            daily.write_daily_csv(daily.read_daily({"stk_dt_pole_chart_qry":[rec()]},"005930",DATE),target)
            text=target.read_text(encoding="utf-8-sig")
            self.assertIn("일자,종목코드,시가,고가,저가,종가,거래량,거래대금",text)
            self.assertIn("2026-10-21",text)
            self.assertNotIn("Bearer",text)
            self.assertNotIn("secret",text)


if __name__=="__main__":
    unittest.main()
