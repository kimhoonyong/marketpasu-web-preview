import test from "node:test";
import assert from "node:assert/strict";
import {assessMultiweekSupport,validateDailyBars} from "../market/daily-support.mjs";
import {parseDailyBarCsv} from "../market/daily-csv.mjs";

const PUB="2026-10-22T09:10:00+09:00";
function sample({pattern=true,volume=200}={}){
 const start=Date.parse("2026-08-01T00:00:00Z");
 const rows=[];
 for(let i=0;i<60;i++){
  const date=new Date(start+i*86400000).toISOString().slice(0,10);
  const training=i<33;
  const hit=[34,42,50].includes(i);
  const follow=[35,43,51].includes(i);
  const low=training?100:(hit?100:(follow?102:103));
  const close=training?102:(hit?101:(follow&&pattern?104:103));
  rows.push({date,open:close,high:Math.max(close,105),
    low,close,volume:training?100:volume,turnover:training?10000:volume*100});
 }
 return rows;
}
const opts={publishedAt:PUB,matchedStock:true,adjustmentsVerified:true,
 earliestSourceVerified:true};
test("older support anchor validated by distinct later touches/rebounds",()=>{
 const r=assessMultiweekSupport({...opts,bars:sample()});
 assert.equal(r.status,"REPEATED_SUPPORT_OBSERVED");
 assert.equal(r.metrics.retestCount,3);
 assert.equal(r.metrics.reboundCount,3);
 assert.equal(r.metrics.priorTradingDays,60);
 assert.equal(r.metrics.recentVsEarlierTurnoverRatio,2);
});
test("missing day bars does not invent accumulation signal",()=>{
 const r=assessMultiweekSupport({...opts,bars:sample().slice(0,10)});
 assert.equal(r.status,"NOT_ASSESSABLE");
 assert.equal(r.coverage,"INSUFFICIENT_DAILY_BARS");
});
test("ticker must be explicitly verified",()=>{
 const r=assessMultiweekSupport({...opts,matchedStock:false,bars:sample()});
 assert.equal(r.coverage,"TICKER_NOT_VERIFIED");
});
test("unknown splits/adjustments prevent confident classification",()=>{
 const r=assessMultiweekSupport({...opts,adjustmentsVerified:false,bars:sample()});
 assert.equal(r.status,"ADJUSTMENT_CHECK_REQUIRED");
 assert.ok(r.signals.some(x=>x.code==="MULTIWEEK_REPEAT_SUPPORT"));
});
test("unknown earliest publisher time never establishes preknowledge",()=>{
 const r=assessMultiweekSupport({...opts,earliestSourceVerified:false,bars:sample()});
 assert.equal(r.status,"NEWS_ORIGIN_UNVERIFIED");
 assert.match(r.disclaimer,/입증할 수 없습니다/);
});
test("exclude same news date and all later dates from any support evidence",()=>{
 const base=sample();
 const future=[...base,{date:"2026-10-22",open:1,high:1,low:1,close:1,volume:99999,turnover:99999},
 {date:"2026-10-23",open:1,high:1,low:1,close:1,volume:99999,turnover:99999}];
 const x=assessMultiweekSupport({...opts,bars:future});
 const y=assessMultiweekSupport({...opts,bars:base});
 assert.deepEqual(x.metrics,y.metrics);
});
test("simple repeated low without subsequent rebound is NOT validated support",()=>{
 const bars=sample().map((x,i)=>i>=33?{...x,close:101,open:101,high:102}:x);
 const r=assessMultiweekSupport({...opts,bars});
 assert.notEqual(r.status,"REPEATED_SUPPORT_OBSERVED");
 assert.equal(r.metrics.reboundCount,0);
});
test("invalid OHLC, duplicate dates, and impossible day are not accepted",()=>{
 const rows=[{date:"2026-10-20",open:100,high:101,low:99,close:100},
 {date:"2026-10-20",open:100,high:101,low:99,close:100},
 {date:"2026-02-30",open:100,high:101,low:99,close:100},
 {date:"2026-10-19",open:100,high:99,low:101,close:100}];
 assert.equal(validateDailyBars(rows).length,1);
});
test("parse actual ka10081 Korean CSV with turnover and signed-free prices",()=>{
 const csv="일자,종목코드,시가,고가,저가,종가,거래량,거래대금\n"+
 "20261020,005930,100,110,98,105,1000,200000\n"+
 "20261021,005930,105,112,100,109,2000,240000";
 const parsed=parseDailyBarCsv(csv,{ticker:"005930"});
 assert.equal(parsed.bars.length,2);
 assert.equal(parsed.bars[0].date,"2026-10-20");
 assert.equal(parsed.bars[1].turnover,240000);
});
test("never accept mixed stock files",()=>{
 const csv="일자,종목코드,시가,고가,저가,종가\n20261020,005930,100,110,98,105\n20261021,000660,105,112,100,109";
 assert.throws(()=>parseDailyBarCsv(csv,{ticker:"005930"}),/다른 종목/);
});
test("do not misread missing turnover as zero or volume as turnover",()=>{
 const csv="일자,종목코드,시가,고가,저가,종가,거래량\n20261020,005930,100,110,98,105,1000";
 const r=parseDailyBarCsv(csv,{ticker:"005930"});
 assert.equal(r.bars[0].turnover,null);
});
