import test from "node:test";
import assert from "node:assert/strict";
import {assessNewsAccumulationEvidence,validatedOneMinuteBars} from "../market/accumulation-evidence.mjs";

const NEWS="2026-10-22T04:00:00+09:00";
const when=Date.parse(NEWS);
const base={matchedStock:true,aggressorSideVerified:true,earliestSourceVerified:true,stockCode:"005930",publishedAt:NEWS};
function minuteRows(kind="accumulation"){
  const rows=[];
  for(let m=-120;m<=30;m++){
    let open=100,close=100,high=100.3,low=99.7,volume=100,turnover=10000;
    let buyVolume=50,sellVolume=50;
    if(m>-60&&m<=0){
      if(kind==="accumulation"){
        close=100.7;high=101;low=100;turnover=25000;volume=250;
        buyVolume=175;sellVolume=75;
      }
      if(kind==="distribution"){
        const up=m<=-20;
        open=up?105:108;close=up?110:104;
        high=up?112:109;low=up?104:103;
        volume=300;turnover=30000;buyVolume=130;sellVolume=170;
      }
    }
    if(m>0){
      if(kind==="accumulation"){
        open=100.7;close=101.1;high=101.3;low=100.6;
        buyVolume=170;sellVolume=70;
      }
      if(kind==="distribution"){
        open=104;close=100;high=104.5;low=99;
        buyVolume=60;sellVolume=210;
      }
    }
    rows.push({time:new Date(when+m*60000).toISOString(),
      open,high,low,close,volume,turnover,buyVolume,sellVolume});
  }
  return rows;
}
test("missing market data is not interpreted as lack of accumulation",()=>{
  const r=assessNewsAccumulationEvidence({...base,bars:[]});
  assert.equal(r.status,"NOT_ASSESSABLE");
  assert.equal(r.dataStatus,"PRE_NEWS_BARS_INSUFFICIENT");
});
test("unmatched ticker is not assessed",()=>{
  const r=assessNewsAccumulationEvidence({...base,matchedStock:false,bars:minuteRows()});
  assert.equal(r.dataStatus,"STOCK_MATCH_MISSING");
});
test("strict timezone required to compare news and price",()=>{
  const r=assessNewsAccumulationEvidence({...base,publishedAt:"2026-10-22T04:00:00",bars:minuteRows()});
  assert.equal(r.dataStatus,"NEWS_TIME_UNVERIFIED");
});
test("steady price + raised turnover + buy-initiated trades yields accumulation-like clues only",()=>{
  const r=assessNewsAccumulationEvidence({...base,bars:minuteRows()});
  assert.equal(r.status,"ACCUMULATION_LIKE_CLUES");
  assert.ok(r.signals.some(s=>s.code==="PRE_NEWS_ABSORPTION_LIKE"));
  assert.ok(r.signals.some(s=>s.code==="POST_NEWS_BUY_FOLLOW_THROUGH"));
  assert.ok(r.disclaimer.includes("확인된 것은 아닙니다"));
  assert.equal(r.metrics.buyInitiatedShareBeforePct,70);
  assert.equal(r.metrics.turnoverBaselineRatio,2.5);
});
test("runup then decline and sell-led prints yields distribution watch, not a verdict",()=>{
  const r=assessNewsAccumulationEvidence({...base,bars:minuteRows("distribution")});
  assert.equal(r.status,"POST_NEWS_DISTRIBUTION_WATCH");
  assert.ok(r.signals.some(s=>s.code==="PRE_NEWS_RUNUP_AND_RETRACE"));
  assert.ok(r.signals.some(s=>s.code==="POST_NEWS_SELL_PRESSURE"));
  assert.ok(!r.status.includes("CONFIRMED"));
});
test("unverified buy/sell classification cannot generate accumulation claim",()=>{
  const r=assessNewsAccumulationEvidence({...base,aggressorSideVerified:false,bars:minuteRows()});
  assert.notEqual(r.status,"ACCUMULATION_LIKE_CLUES");
  assert.equal(r.metrics.buyInitiatedShareBeforePct,null);
  assert.ok(r.notes.some(n=>n.includes("분류 기준 미확인")));
});
test("volume and turnover alone cannot identify any large trader",()=>{
  const rows=minuteRows().map(v=>({...v,buyVolume:null,sellVolume:null}));
  const r=assessNewsAccumulationEvidence({...base,bars:rows});
  assert.notEqual(r.status,"ACCUMULATION_LIKE_CLUES");
  assert.equal(r.metrics.buyInitiatedShareBeforePct,null);
});
test("if no post-news market bars, limit to prior phase and disclose it",()=>{
  const r=assessNewsAccumulationEvidence({...base,bars:minuteRows().filter(x=>Date.parse(x.time)<=when)});
  assert.equal(r.dataStatus,"PRE_ONLY");
  assert.equal(r.metrics.afterPriceChangePct,null);
  assert.ok(r.notes.some(s=>s.includes("미판정")));
});
test("missing contiguous prior records means withhold judgement",()=>{
  const rows=minuteRows().filter(v=>Date.parse(v.time)<when-40*60000 || Date.parse(v.time)>when-12*60000);
  const r=assessNewsAccumulationEvidence({...base,bars:rows});
  assert.equal(r.status,"NOT_ASSESSABLE");
  assert.equal(r.dataStatus,"PRE_NEWS_BARS_INSUFFICIENT");
});
test("duplicate, corrupt high-low and price records cannot create evidence",()=>{
  const rows=minuteRows();
  const clean=validatedOneMinuteBars([
    ...rows,
    {...rows[0],open:1,close:1000000},
    {...rows[1],low:120,high:100},
    {...rows[2],time:"invalid"},
    {...rows[3],time:"2026-10-22T04:00:00"}]);
  assert.equal(clean.length,151);
});
test("negative trade quantities and missing aggressor data are not taken as valid",()=>{
  const rows=minuteRows().map(x=>({...x,buyVolume:-4}));
  const r=assessNewsAccumulationEvidence({...base,bars:rows});
  assert.equal(r.metrics.buyInitiatedShareBeforePct,null);
  assert.notEqual(r.status,"ACCUMULATION_LIKE_CLUES");
});
