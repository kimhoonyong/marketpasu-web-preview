/**
 * Fit candlestick canvas height to the actual CSS viewport and chart width.
 * Browser cannot reliably determine a physical 16/32/42-inch diagonal:
 * use available pixels + user zoom/display scaling.
 */
export function responsiveChartHeight(width,viewportHeight,enlarged=false){
 const w=Number(width),vh=Number(viewportHeight);
 if(!Number.isFinite(w)||!Number.isFinite(vh)||w<=0||vh<=0)return 460;
 const clamp=(min,value,max)=>Math.max(min,Math.min(max,value));
 if(enlarged){
   return Math.round(clamp(430,vh-215,1100));
 }
 const compact=w<480;
 const min=compact?340:410;
 // A tall-ish plot makes volume, estimated money, six MAs and hover legible.
 // Limit it by the viewport to avoid a huge single scroll on 16:10 laptops.
 const suggested=Math.min(w*.80,vh*.76);
 return Math.round(clamp(min,suggested,930));
}
export function chartTextSize(width){
 const w=Number(width);
 if(!Number.isFinite(w)||w<=0)return 12;
 // Leave enough room for price axis labels, including 6+ digit amounts.
 return Math.round(Math.max(12,Math.min(14,w/100)));
}
