import test from "node:test";
import assert from "node:assert/strict";
import {checkedBars,constrainRange,scaleWindow,formatNumber} from "../market/chart-model.mjs";

const row=(date,close=101)=>({date,open:100,high:105,low:99,close,volume:500});
test("sort OHLC data and remove duplicates without inventing candlesticks",()=>{
 const rows=checkedBars([row("2026-10-22"),row("2026-10-21"),
  row("2026-10-22",102)],"daily");
 assert.equal(rows.length,2);
 assert.equal(rows[0].date,"2026-10-21");
 assert.equal(rows[1].close,102);
});
test("corrupt prices, quantities and bars never enter chart",()=>{
 const rows=checkedBars([row("2026-10-20"),{...row("2026-10-21"),high:98},
  {...row("2026-10-22"),volume:-5},{...row("2026-10-23"),close:0}],"daily");
 assert.equal(rows.length,1);
});
test("minute timestamps are sorted by ISO instant",()=>{
 const data=checkedBars([
  {...row(""),date:undefined,time:"2026-10-22T09:02:00+09:00"},
  {...row(""),date:undefined,time:"2026-10-22T09:01:00+09:00"}
 ],"minute");
 assert.equal(data.length,2);
 assert.ok(data[0].stamp<data[1].stamp);
});
test("zoom in preserves anchor and never shows fewer than five candles",()=>{
 const base=constrainRange(300,150,100);
 const zoom=scaleWindow(300,base,.5,.5);
 assert.equal(zoom.count,50);
 assert.equal(zoom.start,175);
 const tiniest=scaleWindow(300,zoom,.00001,.5);
 assert.equal(tiniest.count,5);
});
test("zoom out cannot extend beyond available data",()=>{
 const out=scaleWindow(62,{start:50,count:12},100,.9);
 assert.equal(out.start,0);
 assert.equal(out.count,62);
});
test("pan is bounded even at the start or end",()=>{
 assert.deepEqual(constrainRange(60,-100,18),{start:0,count:18});
 assert.deepEqual(constrainRange(60,1000,18),{start:42,count:18});
});
test("no data chart remains empty",()=>{
 assert.deepEqual(scaleWindow(0,{start:0,count:0},.5),{start:0,count:0});
 assert.equal(formatNumber(null),"-");
});
