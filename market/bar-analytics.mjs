/**
 * MarketPasu bar transformations. OHLCV alone CANNOT establish a buyer or seller.
 * Money:
 * - ka10081 daily: server turns trde_prica (KRW millions) into KRW.
 * - ka10080 1-minute: exact executed value is missing. Close*volume is a rough
 *   closing-price proxy and MUST be marked ESTIMATED, never "trade value".
 * Actual buyer/seller aggression requires the Kiwoom 0B stream with coverage checks.
 */
export const MINUTE_PERIODS=Object.freeze([1,3,5,10,15,30,60,120]);
const isNum=v=>typeof v==="number"&&Number.isFinite(v);
export function minuteTimeframe(rows,period=1){
 if(!MINUTE_PERIODS.includes(period))throw Error("지원하지 않는 분봉 간격");
 if(!Array.isArray(rows))return [];
 const unique=new Map();
 for(const row of rows){
  const time=String(row?.time||"");
  const stamp=Date.parse(time);
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/.test(time)||!Number.isFinite(stamp))continue;
  const validPrice=["open","high","low","close"].every(k=>isNum(row[k])&&row[k]>0)
    &&row.low<=Math.min(row.open,row.close)&&row.high>=Math.max(row.open,row.close);
  if(!validPrice||!isNum(row.volume)||row.volume<0)continue;
  // Absolute timestamp for aggregation, correct within a single selected date.
  unique.set(stamp,{...row,stamp});
 }
 const bars=[...unique.values()].sort((a,b)=>a.stamp-b.stamp);
 if(period===1)return bars.map(({stamp,...b})=>({...b,minutesCovered:1,partial:false,periodMinutes:1}));
 const groups=new Map(),size=period*60_000;
 for(const b of bars){
  const start=Math.floor((b.stamp+9*3600_000)/size)*size-9*3600_000; // bucket begins on KST wall-clock boundaries
  const key=String(start);
  if(!groups.has(key)){
   groups.set(key,{time:new Date(start+9*3600_000).toISOString().slice(0,19)+"+09:00",
    open:b.open,high:b.high,low:b.low,close:b.close,volume:0,
    minuteSamples:0,periodMinutes:period,firstObserved:b.time});
  }
  const out=groups.get(key);
  out.high=Math.max(out.high,b.high);out.low=Math.min(out.low,b.low);
  out.close=b.close;out.volume+=b.volume;out.minuteSamples++;
 }
 return [...groups.values()].map(b=>({...b,minutesCovered:b.minuteSamples,
   partial:b.minuteSamples<period}));
}
export function barAnalytics(bar,{kind="minute"}={}){
 const volume=isNum(bar?.volume)&&bar.volume>=0?bar.volume:null;
 const close=isNum(bar?.close)&&bar.close>0?bar.close:null;
 const validRange=isNum(bar?.low)&&isNum(bar?.high)&&bar.high>=bar.low&&close!==null;
 const position=validRange&&bar.high>bar.low?(close-bar.low)/(bar.high-bar.low):null;
 const upperWick=validRange&&bar.high>0&&isNum(bar.open)?
   (bar.high-Math.max(bar.open,bar.close))/(bar.high-bar.low||1):null;
 // These are price-position clues ONLY, not trade-side data.
 const pricePressure=position===null?"판단 불가":
   position<=.3&&upperWick>=.3?"윗꼬리·저가권 종가 (매도압력 *가능성*)":
   position<=.3?"저가권 종가 (매도압력 *가능성*)":
   position>=.7?"고가권 종가 (매수압력 *가능성*)":"중립권 종가";
 const money=(isNum(bar?.turnover)&&bar.turnover>=0)?bar.turnover:null;
 const exact=kind==="daily"&&bar?.turnoverVerified===true&&money!==null;
 // Only exact executed value / shares yields volume-weighted average cost.
 const vwap=exact&&volume>0?money/volume:null;
 const referencePrice=validRange?(bar.high+bar.low+bar.close)/3:null;
 const estimate=kind==="minute"&&close!==null&&volume!==null?close*volume:null;
 return {turnoverWon:exact?money:null,estimatedValueWon:estimate,
   tradeValueType:exact?"KIWOOM_DAILY_REPORTED":"NOT_AVAILABLE",
   volume,verifiedVwapWon:vwap,referencePriceWon:referencePrice,
   pricePressure,closePosition:position,actualBuyVolume:null,actualSellVolume:null,
   sideClassification:"NOT_AVAILABLE_OHLCV_ONLY"};
}
export function compactWon(value){
 if(!isNum(value))return "미제공";
 const abs=Math.abs(value);
 if(abs>=1e12)return (value/1e12).toLocaleString("ko-KR",{maximumFractionDigits:2})+"조원";
 if(abs>=1e8)return (value/1e8).toLocaleString("ko-KR",{maximumFractionDigits:2})+"억원";
 if(abs>=1e4)return (value/1e4).toLocaleString("ko-KR",{maximumFractionDigits:1})+"만원";
 return Math.round(value).toLocaleString("ko-KR")+"원";
}
