import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {checkedBars,defaultVisibleBars,constrainRange} from "../market/chart-model.mjs";
import {minuteTimeframe} from "../market/bar-analytics.mjs";

const candle=(n)=>({time:new Date(Date.UTC(2026,9,10,0,0)+n*60000).toISOString(),
  open:100,high:110,low:90,close:100,volume:500,turnover:null});
test("initial daily view expands from 60 to roughly 240 bars",()=>{
 assert.equal(defaultVisibleBars(320,"daily",700),240);
 assert.equal(defaultVisibleBars(60,"daily",700),60);
});
test("initial minute view expands from 160 to 600 or more actual bars",()=>{
 assert.equal(defaultVisibleBars(609,"minute",700),600);
 assert.ok(defaultVisibleBars(4000,"minute",1600)>=600);
});
test("full-history control can show every actual loaded candle",()=>{
 const n=8000;
 assert.deepEqual(constrainRange(n,0,n),{start:0,count:8000});
 const code=readFileSync(new URL("../market/candle-chart.mjs",import.meta.url),"utf8");
 assert.match(code,/function resetView\(\)\{\s*windowRange=constrainRange\(data.length,0,data.length\)/);
 assert.match(code,/function recentView\(\)/);
 assert.match(code,/reset\.textContent="전체 기간"/);
});
test("browser does not discard newest minutes after original 5000-row limit",()=>{
 const rows=Array.from({length:8000},(_,i)=>candle(i));
 const verified=checkedBars(rows,"minute");
 assert.equal(verified.length,8000);
 assert.equal(verified[7999].date,rows[7999].time);
});
test("resampling multi-day data cannot merge same-time candles across days",()=>{
 const a=candle(10),b=candle(10+1440);
 const computed=minuteTimeframe([b,a],120);
 assert.equal(computed.length,2);
 assert.ok(computed[0].time.slice(0,10)<computed[1].time.slice(0,10));
});
test("history source date warning is shown in auto-chart UI",()=>{
 const source=readFileSync(new URL("../market/auto-charts.mjs",import.meta.url),"utf8");
 assert.match(source,/lastAvailableLagDays/);
 assert.match(source,/historyScope/);
 assert.match(source,/85000/);
 assert.match(source,/sourceFirst/);
 assert.match(source,/sourceLast/);
});
