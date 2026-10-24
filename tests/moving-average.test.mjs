import test from "node:test";
import assert from "node:assert/strict";
import {MA_PERIODS,MA_STYLE,movingAverage,movingAverages,availablePeriods} from "../market/moving-average.mjs";

const candles=(count,valueFn=i=>i+1)=>Array.from({length:count},(_,i)=>({
 date:"test"+i,close:valueFn(i)
}));
test("six MA periods requested, with 20 and 240 visually distinct",()=>{
 assert.deepEqual(MA_PERIODS,[5,10,20,60,120,240]);
 assert.ok(MA_STYLE[20].width>MA_STYLE[5].width);
 assert.ok(MA_STYLE[240].width>MA_STYLE[120].width);
});
test("MA5 uses closing prices and never early provisional values",()=>{
 const v=movingAverage(candles(6),5);
 assert.deepEqual(v,[null,null,null,null,3,4]);
});
test("MA240 only appears after 240 actual candles",()=>{
 const a=movingAverage(candles(239),240);
 assert.equal(a.length,239);
 assert.ok(a.every(x=>x===null));
 const b=movingAverage(candles(240),240);
 assert.equal(b[238],null);
 assert.equal(b[239],120.5);
});
test("MA240 computed from full source series, even while zooming 60 candles",()=>{
 const data=candles(320);
 const m=movingAverages(data);
 assert.equal(m.get(240)[319],200.5);
 assert.equal(m.get(20)[319],310.5);
 assert.deepEqual(availablePeriods(data),MA_PERIODS);
 assert.deepEqual(availablePeriods(data.slice(-60)),[5,10,20,60]);
});
test("no fictitious historical MA when fewer than 240 data points",()=>{
 const v=movingAverages(candles(150));
 assert.equal(v.get(240)[149],null);
 assert.equal(v.get(120)[149],90.5);
});
test("constant close produces stable MA rather than time-weighted volume average",()=>{
 const v=movingAverage(candles(260,()=>15000),240);
 assert.equal(v[259],15000);
});
test("invalid periods or nonpositive bar prices are rejected",()=>{
 assert.throws(()=>movingAverage(candles(10),0));
 assert.throws(()=>movingAverage([{close:0}],5));
});
test("zoom clipping cannot modify MA history",()=>{
 const all=candles(300);
 const ma=movingAverage(all,240);
 const before=ma[299];
 const shown=all.slice(-60);
 assert.equal(ma[299],before);
 assert.equal(shown.length,60);
 assert.ok(ma[299]>0);
});
