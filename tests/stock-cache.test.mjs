import test from "node:test";
import assert from "node:assert/strict";
import {suggestStockFromTitle,stockKey} from "../market/stock-hints.mjs";
import {kstDay,prepareDailySeries,combineSession,chooseArticleSeries} from "../market/market-bar-cache.mjs";

const newsTime="2026-10-22T03:00:00+09:00";
const base=Date.parse(newsTime);
const bar=(m)=>({time:new Date(base+m*60000).toISOString(),
  open:100,high:102,low:99,close:101,volume:100,turnover:10000,
  buyVolume:null,sellVolume:null});
test("unique exact Korean issuer produces a suggestion, not verification",()=>{
 const x=suggestStockFromTitle("삼성전자, 3분기 실적 발표");
 assert.equal(x.status,"suggested");
 assert.equal(x.candidates[0].code,"005930");
 assert.match(x.reason,/확인/);
});
test("multiple issuers cannot be auto-selected",()=>{
 const x=suggestStockFromTitle("삼성전자·SK하이닉스, 반도체주 하락");
 assert.equal(x.status,"ambiguous");
 assert.equal(x.candidates.length,2);
});
test("generic NAVER Pay/Blog content does not become NAVER issuer news",()=>{
 for(const t of ["네이버페이 머니스토리 금리 전망","네이버 블로그 대입설명회","네이버 프리미엄콘텐츠 재테크"]){
  assert.equal(suggestStockFromTitle(t).status,"none",t);
 }
});
test("hyundai securities is not misidentified as Hyundai Motor",()=>{
 assert.equal(suggestStockFromTitle("현대차증권 3분기 순익 746억").status,"none");
});
test("Tesla/NVIDIA English tickers and Korean brand aliases",()=>{
 assert.equal(suggestStockFromTitle("Tesla quarterly results").candidates[0].code,"TSLA");
 assert.equal(suggestStockFromTitle("엔비디아 AI 투자").candidates[0].code,"NVDA");
 assert.equal(suggestStockFromTitle("LG전자 조력발전소").candidates[0].code,"066570");
});
test("vague macro headline or RSS topic cannot imply a stock",()=>{
 const x=suggestStockFromTitle("코스피·코스닥 급락");
 assert.equal(x.status,"none");
});
test("stock code preserves six-digit identifiers and US ticker format",()=>{
 assert.equal(stockKey("5930"),"005930");
 assert.equal(stockKey("A005930"),"005930");
 assert.equal(stockKey("tsla"),"TSLA");
 assert.equal(stockKey("00593!"),"");
});
test("KST day grouping retains one stock key per date",()=>{
 const a=prepareDailySeries("005930",[bar(0),bar(1),bar(10)]);
 assert.equal(a.length,1);
 assert.equal(a[0].id,"005930:2026-10-22");
 assert.equal(a[0].bars.length,3);
 assert.equal(kstDay("2026-10-21T15:30:00Z"),"2026-10-22");
});
test("records on different trading days never merge",()=>{
 const a=prepareDailySeries("TSLA",[bar(0),bar(1440)]);
 assert.equal(a.length,2);
 assert.throws(()=>combineSession(a[0],a[1]),/다른 종목/);
});
test("combining same session merges by timestamp without double counting",()=>{
 const a=prepareDailySeries("005930",[bar(0),bar(1)])[0];
 const b=prepareDailySeries("005930",[bar(1),bar(2)])[0];
 const c=combineSession(a,b);
 assert.equal(c.bars.length,3);
 assert.equal(c.stockCode,"005930");
});
test("choose cached data ONLY for same ticker near news time",()=>{
 const samsung=prepareDailySeries("005930",[bar(-60),bar(0)])[0];
 const lg=prepareDailySeries("066570",[bar(-30)])[0];
 assert.equal(chooseArticleSeries([lg,samsung],"005930",newsTime)?.stockCode,"005930");
 assert.equal(chooseArticleSeries([lg,samsung],"000660",newsTime),null);
 assert.equal(chooseArticleSeries([lg],"005930",newsTime),null);
 assert.equal(chooseArticleSeries([samsung],"005930","2026-10-30T09:00:00+09:00"),null);
});
test("bad OHLC input is removed and no invented bars are cached",()=>{
 const z=prepareDailySeries("005930",[bar(0),{...bar(1),high:1}]);
 assert.equal(z[0].bars.length,1);
});
