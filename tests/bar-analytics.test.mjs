import test from "node:test";
import assert from "node:assert/strict";
import {minuteTimeframe,barAnalytics,compactWon,MINUTE_PERIODS} from "../market/bar-analytics.mjs";
import {checkedBars} from "../market/chart-model.mjs";
const make=(clock,o,h,l,c,v)=>({
 time:"2026-10-23T"+clock+":00+09:00",
 open:o,high:h,low:l,close:c,volume:v,turnover:null
});
test("minute selection includes requested eight 1m through 120m periods",()=>{
 assert.deepEqual(MINUTE_PERIODS,[1,3,5,10,15,30,60,120]);
 for(const period of MINUTE_PERIODS){
  assert.deepEqual(minuteTimeframe([],period),[]);
 }
 assert.throws(()=>minuteTimeframe([],45));
});
test("3-minute candle has first open last close, true max/min, summed volume",()=>{
 const bars=[
  make("09:00",100,112,98,111,100),
  make("09:01",111,113,97,103,250),
  make("09:02",103,110,100,106,300)];
 const out=minuteTimeframe(bars,3);
 assert.equal(out.length,1);
 assert.equal(out[0].time,"2026-10-23T09:00:00+09:00");
 assert.deepEqual([out[0].open,out[0].high,out[0].low,out[0].close,out[0].volume],
 [100,113,97,106,650]);
 assert.equal(out[0].partial,false);
});
test("120-minute buckets use Korea 08:00 anchor, not UTC wall clock",()=>{
 const rows=[make("08:01",100,102,99,101,20),make("09:59",101,103,100,102,30),
 make("10:00",102,104,101,103,40),make("11:40",103,105,102,104,50)];
 const out=minuteTimeframe(rows,120);
 assert.equal(out.length,2);
 assert.equal(out[0].time,"2026-10-23T08:00:00+09:00");
 assert.equal(out[1].time,"2026-10-23T10:00:00+09:00");
 assert.equal(out[0].volume,50);
 assert.equal(out[1].volume,90);
});
test("selected timeframe never fabricates minute candles for missing exchanges",()=>{
 const out=minuteTimeframe([make("09:00",100,100,100,100,5),
 make("09:02",100,100,100,100,5)],3);
 assert.equal(out.length,1);
 assert.equal(out[0].minutesCovered,2);
 assert.equal(out[0].partial,true);
});
test("different day candles can never be merged together",()=>{
 const bars=[make("19:59",99,105,98,100,10),
 {...make("08:00",100,120,90,110,20),time:"2026-10-24T08:00:00+09:00"}];
 const x=minuteTimeframe(bars,120);
 assert.equal(x.length,2);
});
test("daily reported turnover generates valid won per share weighted mean",()=>{
 const bar={open:10000,high:11000,low:9900,close:10500,volume:20000,
  turnover:210_000_000,turnoverVerified:true};
 const x=barAnalytics(bar,{kind:"daily"});
 assert.equal(x.turnoverWon,210_000_000);
 assert.equal(x.verifiedVwapWon,10500);
 assert.equal(x.estimatedValueWon,null);
 assert.equal(x.actualBuyVolume,null);
});
test("reported daily million-KRW field cannot be passed through without verification",()=>{
 const v=barAnalytics({open:100,high:110,low:90,close:105,volume:10000,
   turnover:999,turnoverVerified:false},{kind:"daily"});
 assert.equal(v.turnoverWon,null);
 assert.equal(v.verifiedVwapWon,null);
});
test("minute turnover and weighted average cannot be reported as exact from ka10080",()=>{
 const v=barAnalytics(make("09:00",99,115,97,100,100),{kind:"minute"});
 assert.equal(v.turnoverWon,null);
 assert.equal(v.estimatedValueWon,10000);
 assert.equal(v.verifiedVwapWon,null);
 assert.equal(v.referencePriceWon,104);
 assert.equal(v.sideClassification,"NOT_AVAILABLE_OHLCV_ONLY");
});
test("red bullish candle can still show lower-close selling pressure risk",()=>{
 const a=barAnalytics(make("09:00",100,160,95,105,100),{kind:"minute"});
 assert.ok(a.pricePressure.includes("매도압력"));
 assert.equal(a.actualSellVolume,null);
 assert.equal(a.actualBuyVolume,null);
});
test("no price-range, no pressure inference",()=>{
 const v=barAnalytics(make("09:00",100,100,100,100,100),{kind:"minute"});
 assert.equal(v.pricePressure,"판단 불가");
});
test("validated chart rows retain turnover provenance and missing sample warnings",()=>{
 const rows=checkedBars([
  {...make("09:00",99,102,90,100,10),turnoverVerified:false,partial:true,minutesCovered:1,periodMinutes:3}
 ],"minute");
 assert.equal(rows[0].partial,true);
 assert.equal(rows[0].periodMinutes,3);
 assert.equal(rows[0].turnoverVerified,false);
});
test("sum values shown in readable KRW denominations",()=>{
 assert.equal(compactWon(155000000),"1.55억원");
 assert.equal(compactWon(null),"미제공");
});
