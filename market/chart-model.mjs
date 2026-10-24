/** Pure scale/market-bar helpers for responsive candlestick charts. */
export function checkedBars(bars,kind){
 if(!Array.isArray(bars))return [];
 const keyed=new Map();
 for(const raw of bars.slice(0,5000)){
  const id=kind==="daily"?String(raw?.date||""):String(raw?.time||"");
  const stamp=kind==="daily"?Date.parse(id+"T00:00:00Z"):Date.parse(id);
  const open=Number(raw?.open),high=Number(raw?.high),low=Number(raw?.low),
        close=Number(raw?.close),volume=Number(raw?.volume);
  if(!id||!Number.isFinite(stamp)||![open,high,low,close].every(x=>Number.isFinite(x)&&x>0)
    ||high<Math.max(open,close)||low>Math.min(open,close)||low>high||!Number.isFinite(volume)||volume<0)continue;
  keyed.set(id,{date:id,stamp,open,high,low,close,volume,turnover:
    raw.turnover===null||raw.turnover===undefined?null:Number(raw.turnover)});
 }
 return [...keyed.values()].sort((a,b)=>a.stamp-b.stamp);
}
export function constrainRange(total,start,count){
 if(!Number.isFinite(total)||total<=0)return {start:0,count:0};
 count=Math.max(5,Math.min(total,Math.round(count)));
 start=Math.max(0,Math.min(total-count,Math.round(start)));
 return {start,count};
}
export function scaleWindow(total,current,factor,anchor=.5){
 if(total<=0)return {start:0,count:0};
 const center=current.start+current.count*Math.max(0,Math.min(1,anchor));
 const count=Math.max(5,Math.min(total,Math.round(current.count*factor)));
 return constrainRange(total,center-count*Math.max(0,Math.min(1,anchor)),count);
}
export function formatNumber(n){
 if(!Number.isFinite(Number(n)))return "-";
 return new Intl.NumberFormat("ko-KR",{maximumFractionDigits:2}).format(n);
}
