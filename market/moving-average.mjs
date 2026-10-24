/**
 * Close-price simple moving averages, calculated on ALL loaded bars before
 * clipping for pan/zoom. No line when fewer than N validated bars exist.
 */
export const MA_PERIODS=Object.freeze([5,10,20,60,120,240]);
export const MA_STYLE=Object.freeze({
  5:{color:"#f9d86f",width:1.4},
  10:{color:"#a7d77c",width:1.4},
  20:{color:"#ffae69",width:3.2},
  60:{color:"#c28df3",width:1.5},
  120:{color:"#70d6e1",width:1.5},
  240:{color:"#fa75b7",width:3.6}
});
export function movingAverage(values,period){
 if(!Number.isSafeInteger(period)||period<1||period>1000)throw Error("Invalid MA period");
 if(!Array.isArray(values))return [];
 const out=Array(values.length).fill(null);
 let sum=0;
 for(let i=0;i<values.length;i++){
  const p=Number(values[i]?.close);
  if(!Number.isFinite(p)||p<=0)throw Error("Invalid sorted bar price");
  sum+=p;
  if(i>=period)sum-=values[i-period].close;
  if(i>=period-1)out[i]=sum/period;
 }
 return out;
}
export function movingAverages(bars,periods=MA_PERIODS){
 const result=new Map();
 for(const p of periods)result.set(p,movingAverage(bars,p));
 return result;
}
export function availablePeriods(bars,periods=MA_PERIODS){
 return periods.filter(n=>bars.length>=n);
}
