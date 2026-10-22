import test from "node:test";
import assert from "node:assert/strict";
import {assessLateNewsRisk,parseBars} from "../market/late-news-risk.mjs";

const NEWS="2026-10-22T03:00:00.000Z";
const now=Date.parse(NEWS);
function bars(pattern="late"){
  const out=[];
  for(let minute=-120;minute<=30;minute++){
    let close=100, high=100, volume=10,turnover=1000;
    if(pattern==="late" && minute>=-40&&minute<=-20) {
      close=100+12*(minute+40)/20;high=close;
      if(minute===-20){volume=45;turnover=4500;}
    }
    if(pattern==="late" && minute>-20&&minute<=0){close=112-7*(minute+20)/20;high=close;}
    if(pattern==="late" && minute>0){close=105-minute/10;}
    if(pattern==="ordinary" && minute>0){close=100+minute/20;}
    out.push({time:new Date(now+minute*60000).toISOString(),
      close,high,volume,turnover,buyVolume:minute>0?100:10,sellVolume:minute>0&&pattern==="late"?250:10});
  }
  return out;
}
test("requires confirmed stock mapping before any inference",()=>{
  assert.equal(assessLateNewsRisk({publishedAt:NEWS,bars:bars()}).status,"NOT_ASSESSABLE");
});
test("does not label arbitrary news as late when there is no market data",()=>{
  const x=assessLateNewsRisk({matchedStock:true,publishedAt:NEWS,bars:[]});
  assert.equal(x.status,"NOT_ASSESSABLE");
  assert.equal(x.coverage,"minute_bars_insufficient");
});
test("identifies post-spike news with reversal and classified sell dominance",()=>{
  const x=assessLateNewsRisk({matchedStock:true,publishedAt:NEWS,bars:bars()});
  assert.equal(x.status,"ELEVATED_LATE_NEWS_RISK");
  for(const key of ["PRE_NEWS_PRICE_SPIKE","PULLBACK_BEFORE_NEWS","PRE_NEWS_VOLUME_SURGE","POST_NEWS_SELL_DOMINANCE"]){
    assert.ok(x.signals.some(s=>s.code===key),key);
  }
  assert.ok(!JSON.stringify(x).includes("확정 시세조종"));
});
test("price drift after early news is not automatically a pump and dump",()=>{
  const x=assessLateNewsRisk({matchedStock:true,publishedAt:NEWS,bars:bars("ordinary")});
  assert.equal(x.status,"NO_STRONG_PATTERN_OBSERVED");
});
test("invalid and duplicate minute bars cannot manufacture evidence",()=>{
  const dataset=bars("ordinary");
  dataset.push({...dataset[0],close:1000000},{time:"garbage",close:999},{time:dataset[1].time,close:-1});
  assert.equal(parseBars(dataset).length,151);
});
test("must have source timezone precision",()=>{
  assert.equal(assessLateNewsRisk({matchedStock:true,publishedAt:"",bars:bars()}).coverage,"news_time_missing");
});
test("no classified sell pressure inferred from missing buy/sell measurements",()=>{
  const dataset=bars().map(row=>({...row,buyVolume:null,sellVolume:null}));
  const x=assessLateNewsRisk({matchedStock:true,publishedAt:NEWS,bars:dataset});
  assert.ok(!x.signals.some(v=>v.code==="POST_NEWS_SELL_DOMINANCE"));
});
test("30 min later repost not considered an earlier story without source timestamps",()=>{
  const x=assessLateNewsRisk({matchedStock:true,publishedAt:NEWS,bars:bars(),headlineSource:"Google News RSS"});
  assert.ok(x.notes.some(n=>n.includes("교차 검증")));
});
