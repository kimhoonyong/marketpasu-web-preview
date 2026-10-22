import datetime as dt
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]/"integrations"/"kiwoom"


def load(filename,name):
    spec=importlib.util.spec_from_file_location(name,ROOT/filename)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


probe=load("scout_preflight.py","kiwoom_preflight")
obs=load("realtime_0b_observe.py","kiwoom_0b_observe")


def record(clock="090102", ticker="005930", trade_qty="+20", price="-80100",
           buy="12", sell="8", receive="2026-10-22T09:01:02+09:00"):
    return {"received_at":receive,
            "message":{"trnm":"REAL","data":[{"type":"0B","item":ticker,
                "values":{"20":clock,"10":price,"15":trade_qty,
                          "1315":sell,"1316":buy,
                          "1030":"900000","1031":"1000000"}}]}}


class ScoutPreflightTests(unittest.TestCase):
    def test_discovers_existing_modules_vault_by_file_metadata_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/"secure_credentials.py").write_text("SHOULD_NOT_BE_IMPORTED",encoding="utf-8")
            data=root/"data";data.mkdir()
            (data/"kiwoom_rest_credentials.bin").write_bytes(b"PRIVATE_DO_NOT_READ")
            with patch.object(Path,"read_bytes",side_effect=AssertionError("read secret forbidden")), \
                 patch.object(Path,"read_text",side_effect=AssertionError("read secret forbidden")):
                report=probe.report_environment(roots=[root],env={
                    "KIWOOM_APP_KEY":"SECRET_APP_KEY",
                    "KIWOOM_APP_SECRET":"SECRET_APP_SECRET"},os_name="Windows")
            self.assertEqual(report["status"],"PREFLIGHT_ONLY_NOT_LIVE_AUTHENTICATION")
            self.assertEqual(report["credential_files_read"],0)
            self.assertTrue(report["local_environment_auth_available"])
            self.assertIn("secure_credentials.py",report["existing_kiwoom_roots"][0]["modules"])
            self.assertIn("data/kiwoom_rest_credentials.bin",
                          report["existing_kiwoom_roots"][0]["credential_file_names"])
            self.assertNotIn("SECRET_APP_KEY",json.dumps(report))
            self.assertNotIn("PRIVATE_DO_NOT_READ",json.dumps(report))
            self.assertEqual(report["requests_sent"],0)

    def test_no_existing_credentials_is_not_treated_as_pass(self):
        x=probe.report_environment(roots=[],env={},os_name="Linux")
        self.assertEqual(x["existing_kiwoom_roots"],[])
        self.assertFalse(x["local_environment_auth_available"])
        self.assertFalse(x["windows"])


class ZeroBObservationTests(unittest.TestCase):
    def test_decodes_actual_official_0b_fids_without_cumulative_double_count(self):
        records,rejected=obs.convert_jsonl([json.dumps(record(),ensure_ascii=False)],ticker="005930")
        self.assertEqual(rejected,0)
        self.assertEqual(len(records),1)
        p=records[0]
        self.assertEqual(p["체결가"],80100)
        self.assertEqual(p["관측체결수량"],20)
        self.assertEqual(p["관측체결대금_계산치"],1602000)
        self.assertEqual(p["매수주도체결_단건관측"],12)
        self.assertEqual(p["매도주도체결_단건관측"],8)
        self.assertEqual(p["관측시각근거"],"capture_received_at")

    def test_wrong_exchange_or_wrong_stock_not_included(self):
        a=record(ticker="005930_NX")
        b=record(ticker="000660")
        data,rejected=obs.convert_jsonl([json.dumps(a),json.dumps(b)],ticker="005930")
        self.assertEqual(data,[])
        self.assertEqual(rejected,2)

    def test_missing_capture_date_requires_explicit_assumption(self):
        frame=record()
        frame.pop("received_at")
        x,_=obs.convert_jsonl([json.dumps(frame)],ticker="005930")
        self.assertEqual(x,[])
        y,_=obs.convert_jsonl([json.dumps(frame)],ticker="005930",
                              assumed_date=dt.date(2026,10,22))
        self.assertEqual(y[0]["관측시각근거"],"user_supplied_date_unverified")

    def test_rejects_replayed_ticks_with_mismatched_receive_time(self):
        x,_=obs.convert_jsonl([json.dumps(record(receive="2026-10-22T11:55:00+09:00"))],
                              ticker="005930")
        self.assertEqual(x,[])

    def test_missing_verified_one_tick_side_does_not_infer_side_from_cumulative(self):
        frame=record()
        values=frame["message"]["data"][0]["values"]
        values.pop("1315")
        values.pop("1316")
        data,_=obs.convert_jsonl([json.dumps(frame)],ticker="005930")
        self.assertEqual(data[0]["매수주도체결_단건관측"],"")
        self.assertEqual(data[0]["매도주도체결_단건관측"],"")
        self.assertIn("1030",values)

    def test_side_aggregate_rejected_when_exceeds_total_trade_quantity(self):
        data,_=obs.convert_jsonl([json.dumps(record(buy="100",sell="100"))],
                                  ticker="005930")
        self.assertEqual(data[0]["매수주도체결_단건관측"],"")

    def test_minute_summary_explicitly_marks_incomplete_market_coverage(self):
        x1=json.dumps(record())
        x2=json.dumps(record(clock="090119",receive="2026-10-22T09:01:19+09:00",
                             trade_qty="5",buy="5",sell="0"))
        t,_=obs.convert_jsonl([x1,x2],ticker="005930")
        m=obs.summarise_observed_minutes(t)
        self.assertEqual(len(m),1)
        self.assertEqual(m[0]["관측체결수량합계"],25)
        self.assertEqual(m[0]["매수주도체결_관측합계"],17)
        self.assertEqual(m[0]["관측자료_완전성"],"부분관측_시장전체검증안됨")
        self.assertNotIn("거래대금",obs.MINUTE_HEADERS)

    def test_no_ohlc_csv_generated_from_partial_tick_collection(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"partial.csv"
            obs.write_output(obs.summarise_observed_minutes(
                obs.convert_jsonl([json.dumps(record())],ticker="005930")[0]),
                p,obs.MINUTE_HEADERS)
            text=p.read_text(encoding="utf-8-sig")
            self.assertIn("부분관측_시장전체검증안됨",text)
            self.assertNotIn("종가",text)
            self.assertNotIn("시가",text)

    def test_only_proper_real_0b_events_are_processed(self):
        login={"trnm":"LOGIN","data":[{"type":"0B","item":"005930","values":{"20":"090102"}}]}
        others={"trnm":"REAL","data":[{"type":"0D","item":"005930","values":{"20":"090102"}}]}
        data,_=obs.convert_jsonl([json.dumps(login),json.dumps(others)])
        self.assertEqual(data,[])


if __name__=="__main__":unittest.main()
