import pathlib
import sys
import unittest
import urllib.error
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]/"integrations"/"kiwoom"
sys.path.insert(0,str(ROOT))
import marketpasu_local_chart_server as local
import rest_minutes as minute

class FakeAuth:
    def ready(self):return True
    def status(self):return "SCOUT_CREDENTIALS_READY"
    def credentials(self):return {"KIWOOM_APP_KEY":"FAKE_PUBLIC_FIXTURE","KIWOOM_APP_SECRET":"FAKE_ONLY"}

class BrokerDiagnosticsTests(unittest.TestCase):
    def test_known_name_resolves_without_stock_catalog_broker_request(self):
        provider=local.ChartProvider(auth=FakeAuth())
        with patch.object(provider,"_token") as token:
            self.assertEqual(provider.symbols("명신산업")[0]["code"],"009900")
            self.assertEqual(provider.symbols("삼성전자")[0]["code"],"005930")
            token.assert_not_called()
        self.assertEqual(provider.symbols("009900")[0]["name"],"명신산업")

    def test_unknown_partial_stock_name_still_requires_real_catalog(self):
        provider=local.ChartProvider(auth=FakeAuth())
        with patch.object(provider,"_token",return_value="TEST"),\
             patch.object(local,"stock_catalog",return_value=[
                 {"code":"009900","name":"명신산업","market":"코스피"}]) as fetch:
            self.assertEqual(provider.symbols("명신")[0]["code"],"009900")
            fetch.assert_called_once()

    def test_token_failure_reports_oauth_stage_not_untyped_generic_error(self):
        provider=local.ChartProvider(auth=FakeAuth())
        with patch.object(local,"get_access_token",side_effect=minute.KiwoomTransportError("HTTP_403")):
            self.assertEqual(provider.diagnose(),
                {"state":"FAILED","stage":"OAUTH","reason":"HTTP_403"})

    def test_catalog_rejected_independent_of_local_auth_ready(self):
        provider=local.ChartProvider(auth=FakeAuth())
        with patch.object(provider,"_token",return_value="FAKE_TOKEN"),\
             patch.object(local,"request_json",side_effect=minute.KiwoomTransportError("HTTP_401")):
            self.assertEqual(provider.diagnose(),
                {"state":"FAILED","stage":"STOCK_LIST","reason":"HTTP_401"})

    def test_one_call_catalog_read_only_test_success_with_known_public_ticker(self):
        provider=local.ChartProvider(auth=FakeAuth())
        calls=[]
        def request(*args):
            calls.append(args)
            return {"list":[{"code":"009900","name":"명신산업","marketName":"코스피"}]},{}
        with patch.object(provider,"_token",return_value="FAKE_TOKEN"),\
             patch.object(local,"request_json",side_effect=request):
            result=provider.diagnose()
        self.assertEqual(result,{"state":"OK","stage":"STOCK_LIST",
                                 "reason":"VERIFIED_READ_ONLY"})
        self.assertEqual(len(calls),1)
        self.assertEqual(calls[0][1],"/api/dostk/stkinfo")
        self.assertEqual(calls[0][3]["api-id"],"ka10099")
        self.assertEqual(calls[0][2],{"mrkt_tp":"0"})
        self.assertNotIn("FAKE_TOKEN",str(result))

    def test_catalog_response_malformed_without_exposing_raw_message(self):
        provider=local.ChartProvider(auth=FakeAuth())
        with patch.object(provider,"_token",return_value="FAKE_TOKEN"),\
             patch.object(local,"request_json",return_value=(
                 {"return_msg":"SENSITIVE_ACCOUNT_DONT_PRINT"},{})):
            result=provider.diagnose()
        self.assertEqual(result["reason"],"UNEXPECTED_RESPONSE")
        self.assertNotIn("SENSITIVE_ACCOUNT",str(result))

    def test_chart_actual_broker_failure_is_stage_coded(self):
        provider=local.ChartProvider(auth=FakeAuth())
        with patch.object(provider,"_token",return_value="FAKE_TOKEN"),\
             patch.object(local,"fetch_daily",side_effect=minute.KiwoomTransportError("HTTP_429")):
            with self.assertRaises(local.KiwoomStageFailure) as caught:
                provider.chart("009900","daily","2026-10-23")
        self.assertEqual(caught.exception.stage,"CHART")
        self.assertEqual(caught.exception.reason,"HTTP_429")

    def test_provider_rejection_reason_does_not_expose_return_message(self):
        data={"return_code":-201,"return_msg":"SENSITIVE_BROKER_TEXT"}
        def opener(_request,timeout):
            class Response:
                headers={}
                def read(self,n):return __import__("json").dumps(data).encode()
                def __enter__(self):return self
                def __exit__(self,*a):return False
            return Response()
        with self.assertRaises(minute.KiwoomTransportError) as caught:
            minute.request_json("https://example.test","/oauth2/token",{}, {},opener=opener)
        self.assertEqual(caught.exception.reason,"PROVIDER_REJECTED")
        self.assertNotIn("SENSITIVE_BROKER_TEXT",str(caught.exception))

    def test_rest_http_status_is_classified_without_reading_body(self):
        for code,expected in [(401,"HTTP_401"),(403,"HTTP_403"),(429,"HTTP_429"),
                              (502,"HTTP_5XX"),(418,"HTTP_OTHER")]:
            def opener(*_a,**_kw):
                raise urllib.error.HTTPError("https://example.test",code,"SENSITIVE",
                                             {},None)
            with self.assertRaises(minute.KiwoomTransportError) as caught:
                minute.request_json("https://example.test","/oauth2/token",{}, {},opener=opener)
            self.assertEqual(caught.exception.reason,expected)

    def test_string_zero_response_code_is_accepted(self):
        def opener(*args,**kwargs):
            class Response:
                headers={}
                def read(self,n):return b'{"return_code":"0","list":[]}'
                def __enter__(self):return self
                def __exit__(self,*args):return False
            return Response()
        data,_=minute.request_json("https://example.test","/api/dostk/stkinfo",{}, {},opener=opener)
        self.assertEqual(data["return_code"],"0")

    def test_invalid_unknown_stage_reason_is_whitelisted(self):
        e=local.KiwoomStageFailure("PRIVATE_TOKEN_STAGE","SECRET_MY_REAL_ACCOUNT")
        self.assertEqual(e.stage,"STOCK_LIST")
        self.assertEqual(e.reason,"UNEXPECTED_RESPONSE")
        self.assertNotIn("SECRET",str(e))

if __name__=="__main__":unittest.main()
