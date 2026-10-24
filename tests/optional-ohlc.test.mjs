import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {hoverSurface,describeBarHover} from "../market/chart-hover.mjs";
const chart=readFileSync(new URL("../market/candle-chart.mjs",import.meta.url),"utf8");
const css=readFileSync(new URL("../market/market.css",import.meta.url),"utf8");
const candle={date:"2026-10-23T13:02:00+09:00",
 open:9100,high:9250,low:9020,close:9210,volume:120,
 turnover:null,turnoverVerified:false};

test("OHLC remains accurate even though it is hidden by default",()=>{
 const p=describeBarHover(candle,"minute","price");
 assert.deepEqual(p.ohlc,{시가:"9,100원",고가:"9,250원",종가:"9,210원",저가:"9,020원"});
 assert.equal(hoverSurface("price"),"none");
});
test("toggle starts OFF and only user action can activate",()=>{
 assert.match(chart,/ohlcEnabled=false/);
 assert.match(chart,/ohlcToggle\.setAttribute\("aria-pressed","false"\)/);
 assert.match(chart,/ohlcStrip\.hidden=true/);
 assert.match(chart,/ohlcToggle\.addEventListener\("click",\(\)=>\{/);
 assert.match(chart,/ohlcEnabled=!ohlcEnabled/);
 assert.match(chart,/ohlcStrip\.hidden=!ohlcEnabled/);
});
test("OHLC strip is before price canvas, never drawn over the chart",()=>{
 assert.match(chart,/area\.before\(ohlcStrip\)/);
 assert.match(chart,/if\(surface==="strip"\)\{\s*hideHover\(\);\s*updateOhlc\(description\);\s*return;/);
 assert.match(css,/\.chart-ohlc-strip\[hidden\]\{display:none!important\}/);
});
test("turning off and leaving the price chart clears stale price values",()=>{
 assert.match(chart,/function clearOhlc\(\)/);
 assert.match(chart,/ohlcDate\.textContent="가격봉에 마우스를 올리면 OHLC를 표시합니다/);
 assert.match(chart,/pointerleave",\(\)=>\{hideHover\(\);if\(ohlcEnabled\)clearOhlc\(\)/);
});
test("both daily and minute charts reuse independently mounted toggle",()=>{
 assert.match(chart,/export function mountCandleChart\(root,\{kind,label\}\)/);
 assert.match(chart,/const ohlcToggle=document\.createElement\("button"\)/);
});
test("price focus navigation and zoom events remain present",()=>{
 assert.match(chart,/lockedFocus=\{index:i\}/);
 assert.match(chart,/canvas\.addEventListener\("wheel"/);
 assert.match(chart,/canvas\.addEventListener\("pointermove"/);
 assert.equal(hoverSurface("volume",false),"tooltip");
 assert.equal(hoverSurface("turnover",false),"tooltip");
});
