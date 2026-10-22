/**
 * Evidence-only daily price support / rebound study before a news date.
 * No assertion that an identifiable investor accumulated shares or had advance
 * knowledge of a news story. Historical price support may be coincidental.
 * This function never uses any bar on or after the article's KST calendar date.
 *
 * Daily input: {date:"YYYY-MM-DD",open,high,low,close,volume?,turnover?}
 * Corporate action / split adjustments must be verified before interpreting
 * apparent support across dates.
 */
const KST_OFFSET=9*3600000;
const DISCLAIMER="반복 지지·반등만으로 특정 세력의 매집, 미공개정보 이용 또는 호재 사전 인지를 입증할 수 없습니다.";
function kstDay(iso){
  if(typeof iso!=="string"||!/(Z|[+-]\d\d:\d\d)$/i.test(iso))return "";
  const time=Date.parse(iso);
  return Number.isFinite(time)?new Date(time+KST_OFFSET).toISOString().slice(0,10):"";
}
function num(value){return typeof value==="number"&&Number.isFinite(value)?value:null;}
function pos(value){const n=num(value);return n!==null&&n>0?n:null;}
function nonneg(value){const n=num(value);return n!==null&&n>=0?n:null;}
function round(value){return Math.round(value*100)/100;}
function avg(values){return values.reduce((a,b)=>a+b,0)/(values.length||1);}
function quantile(sorted,q){return sorted[Math.floor((sorted.length-1)*q)];}
export function validateDailyBars(raw){
  if(!Array.isArray(raw))return [];
  const dates=new Set(),valid=[];
  for(const b of raw.slice(0,500)){
    const date=String(b?.date||"");
    if(!/^\d{4}-\d\d-\d\d$/.test(date))continue;
    const verified=new Date(date+"T00:00:00Z");
    if(!Number.isFinite(verified.getTime())||verified.toISOString().slice(0,10)!==date||dates.has(date))continue;
    const open=pos(b.open),high=pos(b.high),low=pos(b.low),close=pos(b.close);
    if([open,high,low,close].some(v=>v===null)||low>Math.min(open,close)||high<Math.max(open,close)||low>high)continue;
    dates.add(date);
    valid.push({date,open,high,low,close,volume:nonneg(b.volume),turnover:nonneg(b.turnover)});
  }
  return valid.sort((a,b)=>a.date.localeCompare(b.date));
}
function touchAndRebound(rows, support, start){
  // Count distinct support tests only after the anchor has been established.
  let visits=[], last=-99;
  for(let i=start;i<rows.length;i++){
    const b=rows[i];
    if(b.low>=support*.982 && b.low<=support*1.018 && i-last>=4){
      last=i;
      // Rebound must happen in *subsequent* PRE-NEWS bars, not hindsight.
      const future=rows.slice(i+1,Math.min(rows.length,i+5));
      const maxClose=future.length?Math.max(...future.map(v=>v.close)):null;
      const rebound=maxClose!==null&&maxClose>=support*1.025;
      visits.push({date:b.date,low:b.low,rebounded:rebound,
        reboundConfirmedDate:rebound?future.find(v=>v.close>=support*1.025)?.date:null});
    }
  }
  return visits;
}
export function assessMultiweekSupport({
 publishedAt,bars,matchedStock=false,adjustmentsVerified=false,
 earliestSourceVerified=false,lookback=60
}={}){
  const result={status:"NOT_ASSESSABLE",coverage:"UNKNOWN",signals:[],metrics:{},notes:[],
    disclaimer:DISCLAIMER};
  if(!matchedStock){
    result.coverage="TICKER_NOT_VERIFIED";
    result.notes.push("뉴스와 일봉의 종목코드가 같다는 확인이 필요합니다.");
    return result;
  }
  const boundary=kstDay(publishedAt);
  if(!boundary){
    result.coverage="NEWS_TIME_MISSING";
    result.notes.push("뉴스 시간대가 명시되지 않아 분석 기준일을 알 수 없습니다.");
    return result;
  }
  const rows=validateDailyBars(bars).filter(x=>x.date<boundary).slice(-Math.max(20,Math.min(90,lookback)));
  if(rows.length<25){
    result.coverage="INSUFFICIENT_DAILY_BARS";
    result.notes.push("뉴스 날짜 이전의 서로 다른 거래일 일봉이 최소 25개 필요합니다.");
    return result;
  }
  // Anchor support on OLDER candles, then validate retests on LATER candles.
  const anchorCount=Math.floor(rows.length*.55);
  const anchor=rows.slice(0,anchorCount);
  const support=quantile(anchor.map(x=>x.low).sort((a,b)=>a-b),.22);
  const visits=touchAndRebound(rows,support,anchorCount);
  const rebounds=visits.filter(v=>v.rebounded).length;
  const later=rows.slice(anchorCount);
  const prevClose=rows[rows.length-1].close;
  const supportDistancePct=round(100*(prevClose/support-1));
  const closePositionPct=round(100*(prevClose-Math.min(...rows.map(x=>x.low)))/
    (Math.max(...rows.map(x=>x.high))-Math.min(...rows.map(x=>x.low))||1));
  const turnoverReady=rows.every(x=>x.turnover!==null);
  const volumeReady=rows.every(x=>x.volume!==null);
  const turnoverRatio=turnoverReady&&avg(anchor.map(x=>x.turnover))>0
    ?round(avg(later.map(x=>x.turnover))/avg(anchor.map(x=>x.turnover))):null;
  const volumeRatio=volumeReady&&avg(anchor.map(x=>x.volume))>0
    ?round(avg(later.map(x=>x.volume))/avg(anchor.map(x=>x.volume))):null;
  result.coverage="DAILY_PRE_NEWS_ONLY";
  result.metrics={
    priorTradingDays:rows.length,firstDate:rows[0].date,lastDate:rows[rows.length-1].date,
    excludedNewsDate:boundary,supportZoneLow:round(support*.982),
    supportZoneHigh:round(support*1.018),referenceSupport:round(support),
    retestCount:visits.length,reboundCount:rebounds,
    retestDates:visits.map(x=>x.date),reboundDates:visits.filter(x=>x.rebounded).map(x=>x.reboundConfirmedDate),
    lastCloseVersusSupportPct:supportDistancePct,
    lastClosePositionInRangePct:closePositionPct,
    recentVsEarlierTurnoverRatio:turnoverRatio,recentVsEarlierVolumeRatio:volumeRatio
  };
  if(visits.length>=2&&rebounds>=2){
    result.signals.push({code:"MULTIWEEK_REPEAT_SUPPORT",
      description:"먼저 형성된 가격대를 이후 거래일에 두 차례 이상 재시험하고 반등한 패턴"});
  }
  if(turnoverRatio!==null&&turnoverRatio>=1.5){
    result.signals.push({code:"RECENT_DAILY_TURNOVER_EXPANSION",
      description:"최근 구간 평균 일 거래대금이 이전 구간보다 증가"});
  }
  if(volumeRatio!==null&&volumeRatio>=1.5){
    result.signals.push({code:"RECENT_DAILY_VOLUME_EXPANSION",
      description:"최근 구간 평균 일 거래량이 이전 구간보다 증가"});
  }
  result.notes.push("기준 가격대는 과거 첫 55% 거래일의 저가 분포로 산정하고, 이후 45%에서만 재시험·반등을 계산했습니다.");
  result.notes.push("당일 일봉과 뉴스 이후 일봉은 제외했습니다. 분봉처럼 뉴스 시간 전후를 일봉 안에서 구분할 수 없습니다.");
  if(!adjustmentsVerified){
    result.status="ADJUSTMENT_CHECK_REQUIRED";
    result.notes.push("주식분할·배당락·무상증자 등 수정주가 연속성 확인이 없어 해석을 보류했습니다.");
  }else if(!earliestSourceVerified){
    result.status="NEWS_ORIGIN_UNVERIFIED";
    result.notes.push("뉴스 최초 공개시각이 미확인되어 뉴스 사전 인지 또는 매집으로 연결하지 않습니다.");
  }else if(result.signals.some(s=>s.code==="MULTIWEEK_REPEAT_SUPPORT")){
    result.status="REPEATED_SUPPORT_OBSERVED";
  }else{
    result.status="NO_REPEATED_SUPPORT_DETECTED";
    result.notes.push("조건에 맞는 반복 지지·반등이 없더라도 매집이나 매도를 배제할 수 없습니다.");
  }
  return result;
}
