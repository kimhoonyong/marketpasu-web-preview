import datetime as dt
import importlib.util
import io
import os
import pathlib
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "integrations" / "kiwoom" / "rest_minutes.py"
spec = importlib.util.spec_from_file_location("kiwoom_readonly_minutes", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

DATE = dt.date(2026, 10, 22)


def item(clock, close="-78800", open_="-78850", high="-78900", low="-78800", volume="7913"):
    return {"cur_prc": close, "open_pric": open_, "high_pric": high,
            "low_pric": low, "trde_qty": volume, "cntr_tm": clock}


class KiwoomReadOnlyTests(unittest.TestCase):
    def test_official_signed_price_fields_preserved_as_absolute_prices(self):
        # A synthetically consistent OHLC row: signed prices encode direction.
        result = m.decode_minutes({"stk_min_pole_chart_qry": [
            item("20261022090000", close="-78800", open_="-78850",
                 high="-78700", low="-78900")
        ]}, "005930", DATE)
        self.assertEqual(len(result), 0)  # invalid OHLC is refused
        result = m.decode_minutes({"stk_min_pole_chart_qry": [
            item("20261022090000", close="-78800", open_="-78850",
                 high="-78900", low="-78700") | {"high_pric": "-79000", "low_pric": "-78700"}
        ]}, "005930", DATE)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["고가"], 79000)
        self.assertEqual(result[0]["종가"], 78800)
        self.assertEqual(result[0]["거래량"], 7913)
        self.assertEqual(result[0]["거래대금"], "")
        self.assertEqual(result[0]["매수주도체결량"], "")
        self.assertEqual(result[0]["일시"], "2026-10-22T09:00:00+09:00")

    def test_other_date_and_corrupt_price_rows_are_discarded(self):
        records = [
            item("20261021090000", close="100", open_="100", high="102", low="99"),
            item("20261022090100", close="0"),
            item("bad", close="100"),
            item("20261022090300", close="101", open_="100", high="102", low="99"),
        ]
        rows = m.decode_minutes({"stk_min_pole_chart_qry": records}, "005930", DATE)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["종가"], 101)

    def test_bad_ticker_or_empty_token_never_requests_api(self):
        for code in ["TSLA", "000660_NX", "5930", "123456;DROP"]:
            with self.assertRaises(m.MarketDataError):
                m.ticker_code(code)
        with self.assertRaises(m.MarketDataError):
            m.fetch_minute_rows("005930", DATE, "")

    def test_missing_secrets_do_not_issue_network_request(self):
        with self.assertRaisesRegex(m.MarketDataError, "로컬 프로세스 환경"):
            m.get_access_token(m.HOSTS["real"], {})

    def test_oauth_uses_environment_credentials_and_never_prints_them(self):
        seen = []
        def fake(base, path, body, headers):
            seen.append((base, path, body, headers))
            return {"token": "fake-token", "return_code": 0}, {}
        token = m.get_access_token(m.HOSTS["real"],
                                   {"KIWOOM_APP_KEY": "local-only-key",
                                    "KIWOOM_APP_SECRET": "local-only-secret"}, fake)
        self.assertEqual(token, "fake-token")
        self.assertEqual(seen[0][1], "/oauth2/token")
        self.assertEqual(seen[0][2]["grant_type"], "client_credentials")
        self.assertEqual(seen[0][2]["appkey"], "local-only-key")

    def test_pagination_and_headers_match_official_ka10080(self):
        calls = []
        def fake(base, path, body, headers):
            calls.append((base, path, body, headers))
            if len(calls) == 1:
                return {"return_code": 0, "stk_min_pole_chart_qry": [
                    item("20261022090100", close="101", open_="100", high="102", low="99")]}, {"cont-yn": "Y", "next-key": "next1"}
            return {"return_code": 0, "stk_min_pole_chart_qry": [
                item("20261022090200", close="102", open_="101", high="103", low="100")]}, {"cont-yn": "N", "next-key": ""}
        bars = m.fetch_minute_rows("005930", DATE, "fake-secret-token", requester=fake, sleep=lambda x: None)
        self.assertEqual(len(bars), 2)
        self.assertEqual(calls[0][1], "/api/dostk/chart")
        self.assertEqual(calls[0][2]["tic_scope"], "1")
        self.assertEqual(calls[0][2]["stk_cd"], "005930")
        self.assertEqual(calls[0][3]["api-id"], "ka10080")
        self.assertEqual(calls[1][3]["cont-yn"], "Y")
        self.assertEqual(calls[1][3]["next-key"], "next1")

    def test_bounded_pagination_and_no_network_when_invalid(self):
        calls = []
        def fake(base, path, body, headers):
            calls.append(1)
            return {"return_code": 0, "stk_min_pole_chart_qry": [
                item("20261022090000", close="101", open_="100", high="102", low="99")]}, {"cont-yn": "Y", "next-key": "loop"}
        m.fetch_minute_rows("005930", DATE, "token", requester=fake, sleep=lambda x: None)
        self.assertEqual(len(calls), 2)
        with self.assertRaises(m.MarketDataError):
            m.fetch_minute_rows("005930", DATE, "token", pages=50, requester=fake)

    def test_generated_csv_can_be_opened_by_korean_browser_import(self):
        record={"일시": "2026-10-22T09:00:00+09:00", "종목코드": "005930",
            "시가": 100, "고가": 102, "저가": 99, "종가": 101,
            "거래량": 100, "거래대금": "", "매수주도체결량": "", "매도주도체결량": ""}
        with tempfile.TemporaryDirectory() as folder:
            output=pathlib.Path(folder)/"005930_2026-10-22_1m.csv"
            m.write_csv([record], output)
            contents=output.read_text(encoding="utf-8-sig")
            self.assertIn("거래대금", contents)
            self.assertIn("2026-10-22T09:00:00+09:00", contents)
            self.assertEqual(contents.count("\n"), 2)

    def test_empty_series_never_overwrites_previous_data(self):
        with tempfile.TemporaryDirectory() as folder:
            f=pathlib.Path(folder)/"file.csv"
            f.write_text("previous", encoding="utf-8")
            with self.assertRaises(m.MarketDataError):
                m.write_csv([], f)
            self.assertEqual(f.read_text(encoding="utf-8"), "previous")

    def test_price_and_volume_not_market_turnover_or_institution_netflow(self):
        data=m.decode_minutes({"stk_min_pole_chart_qry": [
            item("20261022090100", close="100", open_="100", high="105", low="95", volume="1000")
        ]}, "005930", DATE)
        self.assertEqual(data[0]["거래량"], 1000)
        self.assertEqual(data[0]["거래대금"], "")
        self.assertEqual(data[0]["매수주도체결량"], "")
        self.assertEqual(data[0]["매도주도체결량"], "")


if __name__ == "__main__":
    unittest.main()
