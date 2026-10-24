/**
 * Reframe broker-reported DAILY OHLCV into real observed weekly/monthly bars.
 * Aggregated candles are derived solely from actual returned days.
 * Never fill trading holidays or assume unseen trading days existed.
 */
const validDate=v=>/^\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v+"T00:00:00Z"));
export function dailyPeriodKey(date,mode="daily"){
 if(!validDate(date))throw Error("Invalid daily bar date");
 if(mode==="daily")return date;
 if(mode==="monthly")return date.slice(0,7);
 if(mode!=="weekly")throw Error("Unsupported daily period");
 const day=new Date(date+"T00:00:00Z");
 // ISO weeks start Monday; the year on the Monday is the group key.
 const daysFromMonday=(day.getUTCDay()+6)%7;
 day.setUTCDate(day.getUTCDate()-daysFromMonday);
 return day.toISOString().slice(0,10);
}
export function aggregateDailyBars(dailyBars,mode="daily"){
 if(!["daily","weekly","monthly"].includes(mode))throw Error("Unsupported daily period");
 if(!Array.isArray(dailyBars))return [];
 const ordered=[...dailyBars].filter(x=>validDate(x?.date)&&
   ["open","high","low","close"].every(k=>Number.isFinite(x[k])&&x[k]>0)&&
   x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close)&&
   Number.isFinite(x.volume)&&x.volume>=0).sort((a,b)=>a.date.localeCompare(b.date));
 if(mode==="daily")return ordered;
 const group=new Map();
 for(const bar of ordered){
   const key=dailyPeriodKey(bar.date,mode);
   if(!group.has(key)){
     group.set(key,{date:bar.date,firstDate:bar.date,lastDate:bar.date,
       open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:0,
       turnover:0,turnoverVerified:true,dayCount:0,periodKey:key,
       periodMode:mode});
   }
   const dest=group.get(key);
   dest.date=bar.date;dest.lastDate=bar.date;dest.close=bar.close;
   dest.high=Math.max(dest.high,bar.high);dest.low=Math.min(dest.low,bar.low);
   dest.volume+=bar.volume;dest.dayCount++;
   if(bar.turnoverVerified===true&&Number.isFinite(bar.turnover)&&bar.turnover>=0)
     dest.turnover+=bar.turnover;
   else dest.turnoverVerified=false;
 }
 return [...group.values()].map(b=>({
   ...b,turnover:b.turnoverVerified?b.turnover:null,
   // A partial first/last calendar period is possible; cannot prove trading
   // completeness from daily OHLCV alone.
   historyCoverage:"observed_days_only"
 }));
}
export function calendarGuides(allBars,start,count,mode="daily"){
 if(!Array.isArray(allBars)||!allBars.length||count<=0)return [];
 const guides=[];
 for(let i=Math.max(0,start);i<Math.min(allBars.length,start+count);i++){
   const date=String(allBars[i]?.date||"").slice(0,10);
   if(!validDate(date)||i===0)continue;
   const previous=String(allBars[i-1]?.date||"").slice(0,10);
   if(!validDate(previous))continue;
   const year=date.slice(0,4)!==previous.slice(0,4);
   const month=date.slice(0,7)!==previous.slice(0,7);
   if(year)guides.push({index:i,type:"year",label:date.slice(0,4)+"년"});
   else if(mode==="daily"&&month)guides.push({index:i,type:"month",label:Number(date.slice(5,7))+"월"});
 }
 return guides;
}
/** Correct plot-relative mouse anchor, excluding price-axis margins. */
export function chartAnchor(x,width,left=68,right=75){
 if(!Number.isFinite(x)||!Number.isFinite(width)||width<=left+right)return .5;
 return Math.max(0,Math.min(1,(x-left)/(width-left-right)));
}
export function rangeForSelection(range,total,firstIndex,lastIndex){
 if(!range||!Number.isFinite(total)||total<1)return {start:0,count:0};
 const lo=Math.max(0,Math.min(total-1,Math.min(firstIndex,lastIndex)));
 const hi=Math.max(0,Math.min(total-1,Math.max(firstIndex,lastIndex)));
 const count=Math.max(5,hi-lo+1);
 const start=Math.max(0,Math.min(total-count,lo-Math.floor((count-(hi-lo+1))/2)));
 return {start,count:Math.min(total,count)};
}
