import test from "node:test";
import assert from "node:assert/strict";
import {candlePressure} from "../market/candle-pressure.mjs";
import {describeBarHover,panelAt} from "../market/chart-hover.mjs";

const bar=(open,high,low,close)=>({
 date:"2026-10-23T19:40:00+09:00",open,high,low,close,volume:12000,
 turnover:null,turnoverVerified:false
});
test("red bullish body may show estimated selling pressure if closes near low after upper wick",()=>{
 const v=candlePressure(bar(100,160,95,105));
 assert.equal(v.priceDirection,"UP");
 assert.equal(v.code,"SELL_PRESSURE_CLUE");
 assert.equal(v.label,"매도압력 추정");
 assert.equal(v.observedTradeSide,false);
 assert.match(v.warning,/실제 매수·매도 체결 방향/);
});
test("blue bearish body may show estimated buying pressure when it closes toward high",()=>{
 // Open at high usually closes lower; with a high close, price often must be above open.
 // A falling candle with close near high requires an even higher open.
 const v=candlePressure(bar(110,112,60,109));
 assert.equal(v.priceDirection,"DOWN");
 assert.equal(v.code,"BUY_PRESSURE_CLUE");
 assert.equal(v.label,"매수압력 추정");
 assert.equal(v.observedTradeSide,false);
});
test("ordinary bullish candle ending near high yields buying pressure clue",()=>{
 const v=candlePressure(bar(100,111,98,110));
 assert.equal(v.code,"BUY_PRESSURE_CLUE");
});
test("selling pressure marker is separate from OHLC color",()=>{
 const v=candlePressure(bar(100,130,90,95));
 assert.equal(v.priceDirection,"DOWN");
 assert.equal(v.code,"SELL_PRESSURE_CLUE");
});
test("middle close remains neutral instead of fabricating buy sell side",()=>{
 const v=candlePressure(bar(100,110,90,100));
 assert.equal(v.code,"NEUTRAL");
 assert.equal(v.observedTradeSide,false);
});
test("flat candle with no trading range abstains",()=>{
 assert.equal(candlePressure(bar(100,100,100,100)).code,"UNKNOWN");
});
test("invalid OHLC closes abstain",()=>{
 assert.equal(candlePressure(bar(100,101,102,95)).code,"UNKNOWN");
 assert.equal(candlePressure({}).code,"UNKNOWN");
});
test("price-panel hover reports clear estimate and no actual buy/sell attribution",()=>{
 const tip=describeBarHover(bar(100,160,95,105),"minute","price");
 assert.equal(tip.time,"2026-10-23 19:40");
 assert.match(tip.heading,/매도압력 추정/);
 assert.match(tip.note,/실제 매수·매도 체결 방향/);
 assert.equal(tip.value,"105원");
});
test("price hover is independent of turnover hover at same timestamp",()=>{
 const b=bar(100,160,95,105);
 const price=describeBarHover(b,"minute","price");
 const money=describeBarHover(b,"minute","turnover");
 assert.match(price.heading,/가격봉/);
 assert.match(money.heading,/추정치/);
 assert.doesNotMatch(price.heading,/키움 체결량 확정/);
});
test("canvas price pane is interactive for both zoom sizes",()=>{
 assert.equal(panelAt(22,460),"price");
 assert.equal(panelAt(260,460),"price");
 assert.equal(panelAt(340,460),"volume");
 assert.equal(panelAt(600,780),"volume");
});
