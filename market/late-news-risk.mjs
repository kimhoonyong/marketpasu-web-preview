/**
 * Evidence-only late-news risk screening.
 *
 * Input is a headline publication timestamp and verified one-minute market bars
 * for ONE explicitly matched stock. Nothing in this file identifies intent,
 * wrongdoing, price manipulation or trading recommendations.
 *
 * Bars: {time: ISO8601 with timezone, close: number, high?:number,
 *        volume?:number, turnover?:number, buyVolume?:number, sellVolume?:number}
 * All monetary and share-volume ratios use the same units per series.
 */
const HOUR=60*60*1000;
export function parseBars(bars){
  if(!Array.isArray(bars))return [];
  const seen=new Set();
  const cleaned=[];
  for(const item of bars.slice(0,5000)){
    const time=Date.parse(item?.time);
    const close=Number(item?.close);
    if(!Number.isFinite(time)||!Number.isFinite(close)||close<=0||seen.has(time))continue;
    seen.add(time);
    const usable=(v)=>v===null||v===undefined||v===""?null:(Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null);
    const rawHigh=usable(item.high);
    cleaned.push({time,close,high:rawHigh!==null&&rawHigh>=close?rawHigh:close,
      volume:usable(item.volume),turnover:usable(item.turnover),
      buyVolume:usable(item.buyVolume),sellVolume:usable(item.sellVolume)});
  }
  return cleaned.sort((a,b)=>a.time-b.time);
}
function average(values){return values.reduce((a,b)=>a+b,0)/(values.length||1);}
function validValues(rows,key){return rows.map(x=>x[key]).filter(Number.isFinite);}
function round1(value){return Math.round(value*10)/10;}
export function assessLateNewsRisk({publishedAt,bars,matchedStock=false,headlineSource="",earliestVerifiedSourceAt=""}={}){
  const notes=[];
  const result=(status,coverage,signals=[])=>({status,coverage,signals,headlineSource,notes,
    assessment:"시장 반응에 뒤처진 뉴스의 위험 징후만 평가합니다. 시세조종이나 보도 의도는 판단하지 않습니다."});
  if(!matchedStock){notes.push("이 뉴스와 분봉 데이터가 동일한 종목인지 검증되지 않았습니다.");return result("NOT_ASSESSABLE","stock_unmatched");}
  const published=Date.parse(publishedAt);
  if(!Number.isFinite(published)){notes.push("타임존을 포함한 원문 게시시각이 필요합니다.");return result("NOT_ASSESSABLE","news_time_missing");}
  const source=earliestVerifiedSourceAt?Date.parse(earliestVerifiedSourceAt):NaN;
  if(Number.isFinite(source)&&source>published){notes.push("확인된 최초 출처시각이 게시시각보다 늦으므로 출처시각을 재검토해야 합니다.");}
  const data=parseBars(bars);
  const baseline=data.filter(x=>x.time>=published-2*HOUR && x.time<=published-HOUR);
  const before=data.filter(x=>x.time>published-HOUR && x.time<=published);
  const after=data.filter(x=>x.time>published && x.time<=published+30*60000);
  if(baseline.length<5||before.length<5){
    notes.push("뉴스 전 2시간의 가격·거래량 기준 자료가 부족합니다. 위험이 낮다는 의미가 아닙니다.");
    return result("NOT_ASSESSABLE","minute_bars_insufficient");
  }
  const signals=[];
  const ref=baseline[0].close;
  const peak=before.reduce((a,b)=>b.high>a.high?b:a,before[0]);
  const newsPrice=before[before.length-1].close;
  const gain=100*(peak.high/ref-1);
  const retreat=100*(peak.high-newsPrice)/peak.high;
  const peakedBeforeNews=(published-peak.time)>=10*60000;
  if(gain>=5 && peakedBeforeNews){
    signals.push({code:"PRE_NEWS_PRICE_SPIKE",value:round1(gain),
      description:"게시 최소 10분 전에 주가가 기준 가격 대비 "+round1(gain)+"%까지 상승"});
  }
  if(gain>=5&&retreat>=2.5){
    signals.push({code:"PULLBACK_BEFORE_NEWS",value:round1(retreat),
      description:"뉴스 게시 시점 기준 이전 고점 대비 "+round1(retreat)+"% 되밀림"});
  }
  const baseVolume=validValues(baseline,"volume");
  const beforeVolume=validValues(before,"volume");
  if(baseVolume.length>=5&&beforeVolume.length>=5&&average(baseVolume)>0){
    const ratio=Math.max(...beforeVolume)/average(baseVolume);
    if(ratio>=3){
      signals.push({code:"PRE_NEWS_VOLUME_SURGE",value:round1(ratio),
        description:"게시 전 분당 최대 거래량이 앞선 기준 구간 평균의 "+round1(ratio)+"배"});
    }
  }
  const baseTurnover=validValues(baseline,"turnover");
  const beforeTurnover=validValues(before,"turnover");
  if(baseTurnover.length>=5&&beforeTurnover.length>=5&&average(baseTurnover)>0){
    const ratio=Math.max(...beforeTurnover)/average(baseTurnover);
    if(ratio>=3){
      signals.push({code:"PRE_NEWS_TURNOVER_SURGE",value:round1(ratio),
        description:"게시 전 분당 최대 거래대금이 앞선 기준 구간 평균의 "+round1(ratio)+"배"});
    }
  }
  const buys=validValues(after,"buyVolume"),sells=validValues(after,"sellVolume");
  if(after.length>=5&&buys.length===after.length&&sells.length===after.length){
    const buy=buys.reduce((a,b)=>a+b,0),sell=sells.reduce((a,b)=>a+b,0);
    if(sell>0&&sell>=buy*1.4){
      signals.push({code:"POST_NEWS_SELL_DOMINANCE",value:round1(sell/(buy||1)),
        description:"게시 이후 관측 구간에서 매도로 분류된 체결량이 매수 분류 체결량의 "+round1(sell/(buy||1))+"배"});
    }
  }
  if(after.length<5)notes.push("뉴스 이후 거래 추이가 아직 충분히 집계되지 않았습니다.");
  if(!Number.isFinite(source))notes.push("언론사 최초 보도시각 교차 검증은 아직 완료되지 않았습니다.");
  const distinct=signals.filter(x=>x.code!=="PRE_NEWS_TURNOVER_SURGE").length;
  const spike=signals.some(x=>x.code==="PRE_NEWS_PRICE_SPIKE");
  const fade=signals.some(x=>x.code==="PULLBACK_BEFORE_NEWS"||x.code==="POST_NEWS_SELL_DOMINANCE");
  const status=(spike&&fade&&(signals.length>=3))?"ELEVATED_LATE_NEWS_RISK":
    (spike&&fade||distinct>=2)?"REVIEW_LATE_NEWS_RISK":"NO_STRONG_PATTERN_OBSERVED";
  if(status==="NO_STRONG_PATTERN_OBSERVED")notes.push("현재 입력 데이터에서 강한 후행 신호가 확인되지 않았지만 안전하거나 상승이 보장된다는 뜻은 아닙니다.");
  return result(status,"bounded_one_minute_bars",signals);
}
