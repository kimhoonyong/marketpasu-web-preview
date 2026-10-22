/**
 * Evidence-only accumulation/exit-pressure screen around a news timestamp.
 *
 * IMPORTANT: Initiating-side ("buy"/"sell") prints are NOT institutional investor
 * net purchases. This engine cannot identify a market participant or prove
 * accumulation, distribution, intent, manipulation, or trade profitability.
 *
 * Data contract:
 * - publishedAt: ISO8601 WITH explicit offset, ideally earliest verified source.
 * - bars: one-minute bars for one ticker; {time,open,high,low,close,volume,
 *   turnover,buyVolume,sellVolume}. All timestamps include timezone.
 * - matchedStock: issuer/ticker matched independently (not mere text search).
 * - aggressorSideVerified: buy/sell fields represent classified buyer-initiated
 *   versus seller-initiated trades, not investor identity or actual net ownership.
 *
 * Around the news: earlier baseline [-120,-60] min, prior [-60,0] min,
 * subsequent (0,+30] min. Both phases are optional only where explicitly noted.
 */
const MINUTE=60000;
const DISCLAIMER="매집·물량 출회가 확인된 것은 아닙니다. 거래 체결 방향은 특정 세력의 순매수 또는 보유량을 의미하지 않습니다.";
function timeMs(value){
  if(typeof value!=="string"||!/(Z|[+-]\d\d:\d\d)$/i.test(value))return NaN;
  return Date.parse(value);
}
function nonnegative(value){
  return value===null||value===undefined||value===""?null:
    Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
}
function fixed(value){return Math.round(value*100)/100;}
function avg(xs){return xs.reduce((a,b)=>a+b,0)/(xs.length||1);}
function sum(xs){return xs.reduce((a,b)=>a+b,0);}
export function validatedOneMinuteBars(raw){
  if(!Array.isArray(raw))return [];
  const seen=new Set(),rows=[];
  for(const row of raw.slice(0,5000)){
    const time=timeMs(row?.time),close=Number(row?.close);
    if(!Number.isFinite(time)||!Number.isFinite(close)||close<=0||seen.has(time))continue;
    const open=Number(row?.open),high=Number(row?.high),low=Number(row?.low);
    if(![open,high,low].every(v=>Number.isFinite(v)&&v>0)||
      high<Math.max(open,close)||low>Math.min(open,close)||low>high)continue;
    seen.add(time);
    rows.push({time,open,high,low,close,
      volume:nonnegative(row.volume),turnover:nonnegative(row.turnover),
      buyVolume:nonnegative(row.buyVolume),sellVolume:nonnegative(row.sellVolume)});
  }
  return rows.sort((a,b)=>a.time-b.time);
}
function coverage(rows,minSize){
  if(rows.length<minSize)return false;
  for(let i=1;i<rows.length;i++){
    if(rows[i].time-rows[i-1].time>10*MINUTE)return false;
  }
  return true;
}
function totals(rows,key){
  const values=rows.map(v=>v[key]);
  return values.every(v=>v!==null)?sum(values):null;
}
function sideRatio(rows,verified){
  if(!verified||!rows.length)return null;
  const buy=totals(rows,"buyVolume"),sell=totals(rows,"sellVolume");
  if(buy===null||sell===null||buy+sell===0)return null;
  return fixed(100*buy/(buy+sell));
}
export function assessNewsAccumulationEvidence({
  publishedAt,bars,matchedStock=false,aggressorSideVerified=false,
  earliestSourceVerified=false,stockCode=""
}={}){
  const result={status:"NOT_ASSESSABLE",dataStatus:"UNKNOWN",
    stockCode:String(stockCode||"").slice(0,24),signals:[],metrics:{},
    notes:[],disclaimer:DISCLAIMER};
  if(!matchedStock){
    result.dataStatus="STOCK_MATCH_MISSING";
    result.notes.push("원문 뉴스와 분봉의 종목 일치가 검증되지 않았습니다.");
    return result;
  }
  const moment=timeMs(publishedAt);
  if(!Number.isFinite(moment)){
    result.dataStatus="NEWS_TIME_UNVERIFIED";
    result.notes.push("원문 뉴스의 시간대 포함 게시시각이 필요합니다.");
    return result;
  }
  const rows=validatedOneMinuteBars(bars);
  const baseline=rows.filter(v=>v.time>=moment-120*MINUTE&&v.time<=moment-60*MINUTE);
  const prior=rows.filter(v=>v.time>moment-60*MINUTE&&v.time<=moment);
  const after=rows.filter(v=>v.time>moment&&v.time<=moment+30*MINUTE);
  if(!coverage(baseline,15)||!coverage(prior,20)){
    result.dataStatus="PRE_NEWS_BARS_INSUFFICIENT";
    result.notes.push("뉴스 이전 2시간에 연속된 1분봉이 충분하지 않습니다. 휴장·장전·데이터 누락을 확인해야 합니다.");
    return result;
  }
  result.dataStatus=coverage(after,10)?"PRE_AND_POST":"PRE_ONLY";
  if(result.dataStatus==="PRE_ONLY"){
    result.notes.push("뉴스 이후 30분의 거래 자료가 부족하여 이후 매물 출회 여부는 미판정입니다.");
  }
  if(!earliestSourceVerified){
    result.notes.push("최초 원문 게시시각이 아직 검증되지 않아 '뉴스 이전' 판단이 달라질 수 있습니다.");
  }
  if(!aggressorSideVerified){
    result.notes.push("매수/매도 체결 방향의 분류 기준 미확인: 체결 매수우위 신호를 사용하지 않았습니다.");
  }
  const start=prior[0].open,end=prior[prior.length-1].close;
  const peak=Math.max(...prior.map(v=>v.high));
  const floor=Math.min(...prior.map(v=>v.low));
  const drift=fixed(100*(end/start-1));
  const range=fixed(100*(peak/floor-1));
  const atEnd=fixed(100*(end-floor)/(peak-floor||1));
  const bturn=baseline.every(x=>x.turnover!==null)?avg(baseline.map(v=>v.turnover)):null;
  const pturn=prior.every(x=>x.turnover!==null)?avg(prior.map(v=>v.turnover)):null;
  const turnoverRatio=bturn!==null&&bturn>0&&pturn!==null?fixed(pturn/bturn):null;
  const bvol=baseline.every(x=>x.volume!==null)?avg(baseline.map(v=>v.volume)):null;
  const pvol=prior.every(x=>x.volume!==null)?avg(prior.map(v=>v.volume)):null;
  const volumeRatio=bvol!==null&&bvol>0&&pvol!==null?fixed(pvol/bvol):null;
  const buyPrior=sideRatio(prior,aggressorSideVerified);
  const buyAfter=result.dataStatus==="PRE_AND_POST"?sideRatio(after,aggressorSideVerified):null;
  const afterLast=after.length?after[after.length-1].close:null;
  const afterReturn=result.dataStatus==="PRE_AND_POST"?fixed(100*(afterLast/end-1)):null;
  const premove=fixed(100*(peak/baseline[0].open-1));
  const recoil=fixed(100*(peak-end)/peak);
  result.metrics={beforePriceChangePct:drift,beforeRangePct:range,
    beforeEndPositionPct:atEnd,volumeBaselineRatio:volumeRatio,
    turnoverBaselineRatio:turnoverRatio,buyInitiatedShareBeforePct:buyPrior,
    buyInitiatedShareAfterPct:buyAfter,afterPriceChangePct:afterReturn,
    highVersusBaselinePct:premove,retreatFromHighPct:recoil,
    baselineBars:baseline.length,beforeBars:prior.length,afterBars:after.length};
  const signal=(code,description)=>result.signals.push({code,description});
  const elevatedTurnover=turnoverRatio!==null&&turnoverRatio>=1.7;
  const buyPre=buyPrior!==null&&buyPrior>=59;
  const closeStable=range<=3.5&&drift>=-1&&drift<=3&&atEnd>=50;
  // This is a conjunction of liquidity + execution-side + price resilience.
  if(elevatedTurnover&&buyPre&&closeStable){
    signal("PRE_NEWS_ABSORPTION_LIKE",
      "뉴스 이전 거래대금 확대 + 매수 주도 체결 우세 + 좁은 가격 변동폭 동반");
  }else{
    if(elevatedTurnover)signal("PRE_NEWS_TURNOVER_EXPANSION","뉴스 이전 기준 시간 대비 거래대금 평균 증가");
    if(buyPre)signal("PRE_NEWS_BUY_INITIATED_SHARE","뉴스 이전 매수 주도 체결 비중 상승");
  }
  const sellAfter=buyAfter!==null&&buyAfter<=41;
  if(afterReturn!==null&&afterReturn<=-2&&sellAfter){
    signal("POST_NEWS_SELL_PRESSURE","뉴스 이후 가격 하락과 매도 주도 체결 우위 동반");
  }else if(afterReturn!==null&&afterReturn>=0&&buyAfter!==null&&buyAfter>=59){
    signal("POST_NEWS_BUY_FOLLOW_THROUGH","뉴스 이후 가격 지지와 매수 주도 체결 우위 동반");
  }
  if(premove>=6&&recoil>=3){
    signal("PRE_NEWS_RUNUP_AND_RETRACE","뉴스 이전 급등 이후 게시시각까지 고점 대비 후퇴");
  }
  const preAbsorption=result.signals.some(s=>s.code==="PRE_NEWS_ABSORPTION_LIKE");
  const postSells=result.signals.some(s=>s.code==="POST_NEWS_SELL_PRESSURE");
  const retrace=result.signals.some(s=>s.code==="PRE_NEWS_RUNUP_AND_RETRACE");
  result.status=(postSells&&retrace)?"POST_NEWS_DISTRIBUTION_WATCH":
    preAbsorption?"ACCUMULATION_LIKE_CLUES":
    postSells?"POST_NEWS_SELL_PRESSURE_WATCH":"NO_CLEAR_EVIDENCE";
  if(result.status==="NO_CLEAR_EVIDENCE")
    result.notes.push("뚜렷한 패턴이 검출되지 않아도 매집이나 출회를 배제하는 것은 아닙니다.");
  return result;
}
