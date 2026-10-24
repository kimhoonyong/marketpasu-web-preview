import http.client
import importlib.util
import json
import pathlib
import sys
import threading
import unittest
from unittest.mock import patch

FOLDER=pathlib.Path(__file__).resolve().parents[1]/"integrations"/"kiwoom"
sys.path.insert(0,str(FOLDER))
spec=importlib.util.spec_from_file_location("marketpasu_local_chart",FOLDER/"marketpasu_local_chart_server.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class LocalChartTests(unittest.TestCase):
    def test_symbol_list_uses_official_field_names_and_exact_codes(self):
        rows=mod.normalized_symbols({"list":[
            {"code":"005930","name":"삼성전자","marketName":"코스피"},
            {"code":"009900","name":"명신산업","marketName":"코스피"},
            {"code":"BAD","name":"위조종목"},{"code":"000660","name":""}
        ]})
        self.assertEqual(len(rows),2)
        self.assertEqual(mod.symbol_search(rows,"명신")[0]["code"],"009900")
        self.assertEqual(mod.symbol_search(rows,"삼성")[0]["code"],"005930")

    def test_symbol_search_scoring_exact_names_first(self):
        catalog=[{"code":"005930","name":"삼성전자"},
                 {"code":"123456","name":"삼성전자우"},
                 {"code":"009900","name":"명신산업"}]
        self.assertEqual(mod.symbol_search(catalog,"삼성전자")[0]["code"],"005930")
        self.assertEqual(mod.symbol_search(catalog,"명신")[0]["code"],"009900")

    def test_ka10099_uses_kospi_and_kosdaq_and_no_account_api(self):
        calls=[]
        def fake(base,path,body,headers):
            calls.append((path,body,headers))
            name="삼성전자" if body["mrkt_tp"]=="0" else "코스닥테스트"
            code="005930" if body["mrkt_tp"]=="0" else "900001"
            return {"return_code":0,"list":[{"code":code,"name":name}]},{"cont-yn":"N"}
        got=mod.stock_catalog("dummy",requester=fake,sleep=lambda _:None)
        self.assertEqual(len(calls),2)
        self.assertEqual({x[1]["mrkt_tp"] for x in calls},{"0","10"})
        self.assertTrue(all(x[2]["api-id"]=="ka10099" for x in calls))
        self.assertTrue(all(x[0]=="/api/dostk/stkinfo" for x in calls))
        self.assertEqual(len(got),2)

    def test_ohlc_adapters_preserve_price_volume_without_inventing_flow(self):
        data=mod.normalize_minute_rows([{
            "일시":"2026-10-22T09:05:00+09:00","시가":100,"고가":110,
            "저가":95,"종가":105,"거래량":350
        }])
        self.assertEqual(data[0]["volume"],350)
        self.assertNotIn("buyVolume",data[0])
        daily=mod.normalize_daily_rows([{
            "일자":"2026-10-21","시가":99,"고가":110,"저가":98,"종가":105,
            "거래량":1234,"거래대금":500000
        }])
        self.assertEqual(daily[0]["turnover"],500000*1_000_000)
        self.assertTrue(daily[0]["turnoverVerified"])
        self.assertEqual(daily[0]["turnoverSource"],"ka10081_trde_prica_KRW_millions")
        self.assertEqual(data[0]["turnover"],None)
        self.assertFalse(data[0]["turnoverVerified"])
        self.assertIsNone(data[0]["actualBuyVolume"])
        self.assertIsNone(data[0]["actualSellVolume"])

    def test_missing_existing_keys_blocks_api_before_remote_network(self):
        provider=mod.ChartProvider()
        with patch.dict(mod.os.environ,{},clear=True):
            with self.assertRaises(mod.MarketDataError):
                provider.symbols("미확인종목")

    def test_cached_symbols_do_not_repeat_api_calls(self):
        p=mod.ChartProvider(clock=lambda:100)
        with patch.object(p,"_token",return_value="TEST"), \
             patch.object(mod,"stock_catalog",return_value=[{"code":"005930","name":"삼성전자"}]) as f:
            self.assertEqual(p.symbols("삼성")[0]["code"],"005930")
            self.assertEqual(p.symbols("삼성")[0]["code"],"005930")
            self.assertEqual(f.call_count,1)

    def test_local_http_requires_permitted_origin_and_host(self):
        class Fake:
            def symbols(self,q):return [{"code":"005930","name":"삼성전자"}]
            def chart(self,*args):return {"bars":[]}
            def auth_info(self):return {"authConfigured":False,"authStatus":"NOT_CHECKED"}
        server=mod.ThreadingHTTPServer(("127.0.0.1",0),mod.handler_factory(Fake()))
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            port=server.server_port
            def send(origin,path,method="GET",headers=None):
                conn=http.client.HTTPConnection("127.0.0.1",port,timeout=5)
                hdr={"Origin":origin}
                if headers:hdr.update(headers)
                conn.request(method,path,headers=hdr)
                r=conn.getresponse()
                result=(r.status,r.read().decode("utf-8",errors="replace"))
                conn.close();return result
            self.assertEqual(send("https://evil.example","/symbols?q=abc")[0],403)
            self.assertEqual(send(mod.ALLOWED_ORIGIN,"/symbols?q=%EC%82%BC%EC%84%B1")[0],200)
            self.assertEqual(send(mod.ALLOWED_ORIGIN,"/health")[0],200)
            self.assertEqual(send(mod.ALLOWED_ORIGIN,"/chart?code=005930&kind=daily&date=2026-10-22","POST")[0],405)
            self.assertEqual(send(mod.ALLOWED_ORIGIN,"/symbols?q=test","OPTIONS",{
                "Access-Control-Request-Method":"GET",
                "Access-Control-Request-Private-Network":"true"})[0],204)
        finally:
            server.shutdown();server.server_close();thread.join(timeout=3)

    def test_invalid_chart_request_rejected_without_token(self):
        p=mod.ChartProvider()
        for code,kind,date in [
            ("005930;DROP","daily","2026-10-22"),
            ("005930","order","2026-10-22"),
            ("005930","daily","not-a-date"),
            ("005930","daily","2027-12-31")
        ]:
            with self.assertRaises((mod.MarketDataError,ValueError)):
                p.chart(code,kind,date)


if __name__=="__main__":
    unittest.main()
