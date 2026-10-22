import test from "node:test";
import assert from "node:assert/strict";
import {parseMinuteBarCsv} from "../market/minute-csv.mjs";

const header="일시,종목코드,시가,고가,저가,종가,거래량,거래대금,매수주도체결량,매도주도체결량";
test("Korean stock CSV parses verified KST minute bars and buy/sell columns",()=>{
  const s=header+"\n2026-10-22 09:01,005930,100,105,99,102,200,20000,120,80\n";
  const x=parseMinuteBarCsv(s,{assumeKst:true,ticker:"005930"});
  assert.equal(x.bars.length,1);
  assert.equal(x.bars[0].time,"2026-10-22T00:01:00.000Z");
  assert.equal(x.bars[0].buyVolume,120);
  assert.equal(x.columns.sellVolume,true);
});
test("offset-aware English column format does not require KST override",()=>{
  const s="datetime,open,high,low,close,volume,turnover\n2026-10-22T09:00:00+09:00,100,102,99,101,100,10000";
  const x=parseMinuteBarCsv(s);
  assert.equal(x.bars[0].time,"2026-10-22T00:00:00.000Z");
  assert.equal(x.bars[0].buyVolume,null);
});
test("missing timezone without explicit KST choice is rejected",()=>{
  assert.throws(()=>parseMinuteBarCsv(header+"\n2026-10-22 09:01,005930,100,105,99,102,200,20000,120,80"),/시각 형식/);
});
test("treat ticker code as identifier with leading zeros",()=>{
  const s=header+"\n2026-10-22 09:01,A005930,100,105,99,102,200,20000,120,80\n";
  assert.equal(parseMinuteBarCsv(s,{ticker:"5930",assumeKst:true}).bars.length,1);
});
test("mixture of tickers cannot be used as a single-stock flow assessment",()=>{
  const s=header+"\n2026-10-22 09:01,005930,100,105,99,102,200,20000,120,80\n"+
    "2026-10-22 09:02,000660,100,105,99,102,200,20000,120,80";
  assert.throws(()=>parseMinuteBarCsv(s,{assumeKst:true,ticker:"005930"}),/다른 종목/);
});
test("missing OHLC or malformed bars cannot be extrapolated from tick prints",()=>{
  assert.throws(()=>parseMinuteBarCsv("일시,종가,거래량\n2026-10-22 09:01,100,200",{assumeKst:true}),/필수 열 누락/);
  const s=header+"\n2026-10-22 09:01,005930,100,95,99,102,200,20000,120,80";
  assert.throws(()=>parseMinuteBarCsv(s,{assumeKst:true,ticker:"005930"}),/검증 가능한 분봉/);
});
test("quoted commas inside cells accepted and nonnumeric fields skipped",()=>{
  const s=header+"\n\"2026-10-22 09:01\",005930,100,105,99,102,200,\"20,000\",120,80\n";
  assert.equal(parseMinuteBarCsv(s,{assumeKst:true,ticker:"005930"}).bars[0].turnover,20000);
});
test("reject maliciously oversized or excessive rows locally",()=>{
  const s=header+"\n"+Array(12).fill("2026-10-22 09:01,005930,100,105,99,102,200,20000,120,80").join("\n");
  assert.throws(()=>parseMinuteBarCsv(s,{assumeKst:true,maxRows:10,ticker:"005930"}),/초과/);
});
