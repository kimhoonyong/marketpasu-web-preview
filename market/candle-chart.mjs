import {checkedBars,constrainRange,scaleWindow,formatNumber} from "./chart-model.mjs";
import {MA_PERIODS,MA_STYLE,movingAverages} from "./moving-average.mjs";
import {barAnalytics,compactWon} from "./bar-analytics.mjs";
import {panelAt,hoveredBarIndex,describeBarHover} from "./chart-hover.mjs";

/** Browser canvas OHLC + volume chart, wheel + pinch zoom, pointer pan. */
export function mountCandleChart(root,{kind,label}){
 const canvas=root.querySelector("canvas");
 const detail=root.querySelector(".chart-detail");
 const area=root.querySelector(".chart-area");
 const expand=root.querySelector(".chart-expand");
 const plus=root.querySelector(".chart-plus");
 const minus=root.querySelector(".chart-minus");
 const reset=root.querySelector(".chart-reset");
 let data=[],windowRange={start:0,count:0},pointers=new Map(),dragX=null,pinch=null;
 let maValues=new Map(),enabled=new Set(MA_PERIODS);
 const controls=document.createElement("div");controls.className="chart-ma-controls";
 controls.setAttribute("role","group");controls.setAttribute("aria-label",label+" 이동평균선 표시");
 const labels=new Map();
 for(const period of MA_PERIODS){
   const btn=document.createElement("button");btn.type="button";
   btn.className="chart-ma-switch"+(period===20||period===240?" emphasized":"");
   btn.dataset.period=String(period);btn.setAttribute("aria-pressed","true");
   const swatch=document.createElement("span");swatch.className="ma-color";
   swatch.style.backgroundColor=MA_STYLE[period].color;
   const txt=document.createElement("span");txt.textContent=String(period)+(kind==="daily"?"일":"분");
   btn.append(swatch,txt);controls.append(btn);labels.set(period,btn);
   btn.addEventListener("click",()=>{
     if(!maValues.get(period)?.some(v=>v!==null))return;
     if(enabled.has(period))enabled.delete(period);else enabled.add(period);
     updateButtons();render();
   });
 }
 root.querySelector(".chart-head").after(controls);
 function updateButtons(){
   for(const period of MA_PERIODS){
     const button=labels.get(period),available=data.length>=period;
     button.disabled=!available;
     button.setAttribute("aria-pressed",String(enabled.has(period)&&available));
     button.title=available?"종가 "+period+"봉 단순이동평균선":"계산에 "+period+"개 봉 필요 (현재 "+data.length+"개)";
   }
 }
 const colors={up:"#fa666b",down:"#6cb5ff",grid:"#36506a",text:"#afc4d5",wick:"#b4bfc9"};
 const info=(txt)=>{detail.textContent=txt;};
 // Read-only tooltip overlays the graph: no new Kiwoom request on pointer moves.
 const hover=document.createElement("div");
 hover.className="chart-hover-tooltip";
 hover.hidden=true;
 hover.setAttribute("role","status");
 hover.setAttribute("aria-live","off");
 const guide=document.createElement("div");
 guide.className="chart-hover-guide";guide.hidden=true;
 guide.setAttribute("aria-hidden","true");
 area.append(guide,hover);
 function hideHover(){
   hover.hidden=true;guide.hidden=true;
 }
 function showHover(index,pane,x,y){
   const record=data[index];
   const description=describeBarHover(record,kind,pane);
   if(!description){hideHover();return;}
   hover.replaceChildren();
   const heading=document.createElement("strong");
   heading.textContent=description.heading;
   const time=document.createElement("span");
   time.className="chart-hover-time";time.textContent=description.time;
   const value=document.createElement("b");
   value.className="chart-hover-value";value.textContent=description.value;
   const note=document.createElement("span");
   note.className="chart-hover-note";note.textContent=description.note;
   hover.append(heading,time,value,note);
   hover.hidden=false;
   // Position after the text dimensions are known; never leave the chart area.
   const maxX=Math.max(4,area.clientWidth-hover.offsetWidth-5);
   const maxY=Math.max(4,canvas.clientHeight-hover.offsetHeight-5);
   hover.style.left=Math.max(4,Math.min(maxX,x+15))+"px";
   hover.style.top=Math.max(4,Math.min(maxY,y-hover.offsetHeight-12))+"px";
   const rect=canvas.getBoundingClientRect();
   const count=windowRange.count;
   guide.style.left=(68+(index-windowRange.start+.5)*(rect.width-68-75)/count)+"px";
   guide.style.top="20px";guide.style.height=(rect.height-53)+"px";
   guide.hidden=false;
 }

 let activeIndex=null;
 const insights=root.querySelector(".bar-insights");
 function inspect(index){
   const b=data[index];if(!b||!insights)return;
   const a=barAnalytics(b,{kind});
   const time=b.date.replace("T"," ").slice(0,kind==="daily"?10:16);
   const money=kind==="daily"?
     (a.turnoverWon!==null?"거래대금 (키움 일봉 제공): "+compactWon(a.turnoverWon):
       "일봉 실제 거래대금 미제공"):
     ("거래대금 추정 (종가×거래량): "+compactWon(a.estimatedValueWon)+" · 실제 거래대금 아님");
   const avg=kind==="daily"?
     (a.verifiedVwapWon!==null?"봉 평균체결단가 (거래대금÷거래량): "+formatNumber(a.verifiedVwapWon)+"원":"봉 평균체결단가: 거래대금 미확인"):
     ("참고가격 (고+저+종)/3: "+formatNumber(a.referencePriceWon)+"원 · 실제 평균체결단가 아님");
   insights.querySelector(".insights-turnover").textContent=time+" · "+money;
   insights.querySelector(".insights-average").textContent=avg+
      " · 거래량 "+formatNumber(b.volume)+"주";
   insights.querySelector(".insights-pressure").textContent=
     "종가 위치: "+a.pricePressure+
     " · 양봉/음봉은 실제 매수·매도 우위가 아님 · 체결 방향별 데이터 미제공"+
     (b.partial?" · 이 시간 구간의 1분봉 표본이 일부만 있음":"");
 }

 const heightFor=()=>root.classList.contains("chart-enlarged")?Math.max(480,Math.min(window.innerHeight-205,790)):460;
 function render(){
  hideHover();
  const rect=area.getBoundingClientRect();
  const w=Math.max(300,Math.round(rect.width||600)),h=heightFor();
  const dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(w*dpr);
  canvas.height=Math.round(h*dpr);
  canvas.style.width=w+"px";
  canvas.style.height=h+"px";
  const ctx=canvas.getContext("2d");
  if(!ctx)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle="#0b1b2d";ctx.fillRect(0,0,w,h);
  if(!data.length){
   ctx.fillStyle=colors.text;ctx.font="14px sans-serif";ctx.fillText("키움 연결 후 실제 차트가 표시됩니다.",18,h/2);
   return;
  }
  windowRange=constrainRange(data.length,windowRange.start,windowRange.count);
  const visible=data.slice(windowRange.start,windowRange.start+windowRange.count);
  if(!visible.length)return;
  const left=68,right=75,top=20,priceBottom=Math.round(h*.59),volTop=priceBottom+21,volBottom=Math.round(h*.77),moneyTop=volBottom+14,moneyBottom=h-33;
  const graphWidth=w-left-right,each=graphWidth/visible.length;
  let low=Math.min(...visible.map(v=>v.low)),high=Math.max(...visible.map(v=>v.high));
  for(const period of enabled){
    const values=maValues.get(period);
    if(!values)continue;
    for(let k=windowRange.start;k<windowRange.start+visible.length;k++){
      const v=values[k];
      if(v!==null&&Number.isFinite(v)){low=Math.min(low,v);high=Math.max(high,v);}
    }
  }
  const pad=(high-low||high*.02)*.08;
  low-=pad;high+=pad;
  const yp=price=>priceBottom-(price-low)/(high-low)*(priceBottom-top);
  const volumeMax=Math.max(1,...visible.map(v=>v.volume));
  const amounts=visible.map(v=>{
    const a=barAnalytics(v,{kind});
    return kind==="daily"?a.turnoverWon:a.estimatedValueWon;
  });
  const moneyMax=Math.max(1,...amounts.filter(v=>v!==null));
  ctx.font="12px sans-serif";
  ctx.strokeStyle=colors.grid;
  ctx.fillStyle=colors.text;
  ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
   let yy=top+(priceBottom-top)/4*i;
   ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(w-right,yy);ctx.stroke();
   ctx.fillText(formatNumber(high-(high-low)*i/4),w-right+6,yy+4);
  }
  const bodyWidth=Math.max(1,Math.min(16,each*.66));
  for(let i=0;i<visible.length;i++){
   const v=visible[i],x=left+each*(i+.5);
   const up=v.close>=v.open;
   const color=up?colors.up:colors.down;
   ctx.strokeStyle=color;ctx.fillStyle=color;
   ctx.beginPath();ctx.moveTo(x,yp(v.high));ctx.lineTo(x,yp(v.low));ctx.stroke();
   const y0=yp(Math.max(v.open,v.close));
   const y1=yp(Math.min(v.open,v.close));
   ctx.fillRect(x-bodyWidth/2,y0,bodyWidth,Math.max(1.3,y1-y0));
   const vy=volBottom-v.volume/volumeMax*(volBottom-volTop);
   ctx.fillRect(x-bodyWidth/2,vy,bodyWidth,Math.max(1,volBottom-vy));
   if(amounts[i]!==null){
     const my=moneyBottom-amounts[i]/moneyMax*(moneyBottom-moneyTop);
     ctx.globalAlpha=.82;
     ctx.fillRect(x-bodyWidth/2,my,bodyWidth,Math.max(1,moneyBottom-my));
     ctx.globalAlpha=1;
   }
  }
  // Paint MA lines over candles; use the FULL history, not the zoomed slice.
  // The 20/240 lines are deliberately thicker for quick recognition.
  ctx.save();
  ctx.beginPath();ctx.rect(left,top,graphWidth,priceBottom-top);ctx.clip();
  for(const period of MA_PERIODS){
    if(!enabled.has(period))continue;
    const values=maValues.get(period);
    if(!values)continue;
    ctx.strokeStyle=MA_STYLE[period].color;
    ctx.lineWidth=MA_STYLE[period].width;
    ctx.lineJoin="round";ctx.lineCap="round";
    ctx.beginPath();
    let started=false;
    for(let j=0;j<visible.length;j++){
      const v=values[windowRange.start+j];
      if(v===null||!Number.isFinite(v)){started=false;continue;}
      const x=left+each*(j+.5),y=yp(v);
      if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.lineWidth=1;
  ctx.strokeStyle=colors.grid;
  ctx.beginPath();ctx.moveTo(left,priceBottom+10);ctx.lineTo(w-right,priceBottom+10);ctx.stroke();
  ctx.fillStyle=colors.text;
  const indices=[0,Math.round((visible.length-1)/2),visible.length-1];
  for(const i of [...new Set(indices)]){
   const raw=visible[i].date;
   const label=kind==="daily"?raw.slice(5):raw.slice(5,16).replace("T"," ");
   const x=left+each*(i+.5);
   ctx.textAlign=i===0?"left":i===visible.length-1?"right":"center";
   ctx.fillText(label,x,h-13);
  }
  ctx.textAlign="left";
  ctx.fillText("거래량",8,volTop+11);
  ctx.fillText(formatNumber(volumeMax),w-right+6,volTop+11);
  ctx.fillText(kind==="daily"?"거래대금":"금액추정",3,moneyTop+12);
  ctx.fillText(compactWon(moneyMax),w-right+6,moneyTop+12);
  const first=visible[0],last=visible[visible.length-1];
  info(label+" · "+first.date.replace("T"," ")+" ~ "+last.date.replace("T"," ")+" · "+visible.length+"봉 / "+data.length+"봉 · 마지막 "+formatNumber(last.close)+"원 · 거래량 "+formatNumber(last.volume));
  if(activeIndex===null||activeIndex<windowRange.start||activeIndex>=windowRange.start+visible.length)activeIndex=windowRange.start+visible.length-1;
  inspect(activeIndex);
 }
 function setData(rows){
   data=checkedBars(rows,kind);
   activeIndex=null;
   maValues=movingAverages(data);
   updateButtons();
   const visible=kind==="daily"?Math.min(data.length,60):Math.min(data.length,160);
   windowRange=constrainRange(data.length,data.length-visible,visible);
   render();
 }
 function resetView(){const visible=kind==="daily"?Math.min(data.length,60):Math.min(data.length,160);windowRange=constrainRange(data.length,data.length-visible,visible);render();}
 function zoom(factor,anchor=.5){windowRange=scaleWindow(data.length,windowRange,factor,anchor);render();}
 function pan(deltaPx){
   if(!data.length)return;
   const width=Math.max(300,area.getBoundingClientRect().width);
   const change=Math.round(-deltaPx/Math.max(5,width-120)*windowRange.count);
   windowRange=constrainRange(data.length,windowRange.start+change,windowRange.count);
   render();
 }
 plus.addEventListener("click",()=>zoom(.74));
 minus.addEventListener("click",()=>zoom(1.35));
 reset.addEventListener("click",()=>resetView());
 expand.addEventListener("click",()=>{
   root.classList.toggle("chart-enlarged");
   expand.textContent=root.classList.contains("chart-enlarged")?"원래 크기":"크게 보기";
   render();
 });
 canvas.addEventListener("wheel",e=>{
   if(!data.length)return;
   e.preventDefault();
   const r=canvas.getBoundingClientRect();
   zoom(e.deltaY>0?1.18:.84,(e.clientX-r.left)/r.width);
 },{passive:false});
 canvas.addEventListener("pointerdown",e=>{
   if(!data.length)return;
   canvas.setPointerCapture(e.pointerId);
   pointers.set(e.pointerId,e.clientX);
   if(pointers.size===1)dragX=e.clientX;
   if(pointers.size===2){
    const xs=[...pointers.values()];
    pinch=Math.abs(xs[0]-xs[1]);dragX=null;
   }
 });
 canvas.addEventListener("pointermove",e=>{
  if(data.length){
    const r=canvas.getBoundingClientRect();
    const left=68,right=75;
    const frac=Math.max(0,Math.min(1,(e.clientX-r.left-left)/Math.max(1,r.width-left-right)));
    activeIndex=Math.min(data.length-1,windowRange.start+Math.floor(frac*windowRange.count));
    inspect(activeIndex);
    const pane=panelAt(e.clientY-r.top,r.height);
    const hovered=hoveredBarIndex(e.clientX-r.left,r.width,windowRange);
    if(pane&&hovered!==null&&pointers.size===0&&e.pointerType!=="touch"){
      showHover(hovered,pane,e.clientX-r.left,e.clientY-r.top);
    }else if(pointers.size===0){
      hideHover();
    }
  }else hideHover();
  if(!pointers.has(e.pointerId))return;
  const old=pointers.get(e.pointerId);
  pointers.set(e.pointerId,e.clientX);
  if(pointers.size===2){
   const xs=[...pointers.values()];
   const next=Math.max(12,Math.abs(xs[0]-xs[1]));
   if(pinch&&Math.abs(next-pinch)>10){zoom(pinch/next);pinch=next;}
   return;
  }
  if(dragX!==null&&Math.abs(e.clientX-dragX)>4){
   const width=Math.max(300,area.getBoundingClientRect().width);
   const each=(width-120)/Math.max(1,windowRange.count);
   if(Math.abs(e.clientX-dragX)>=Math.max(1,each*.75)){
    pan(e.clientX-dragX);dragX=e.clientX;
   }
  }
 });
 function end(e){
  pointers.delete(e.pointerId);
  pinch=null;dragX=null;
 }
 canvas.addEventListener("pointerup",end);
 canvas.addEventListener("pointercancel",e=>{end(e);hideHover();});
 canvas.addEventListener("lostpointercapture",end);
 canvas.addEventListener("pointerleave",hideHover);
 canvas.addEventListener("pointerdown",e=>{
   if(e.pointerType!=="touch"||pointers.size!==1)return;
   const r=canvas.getBoundingClientRect();
   const pane=panelAt(e.clientY-r.top,r.height);
   const index=hoveredBarIndex(e.clientX-r.left,r.width,windowRange);
   if(pane&&index!==null)showHover(index,pane,e.clientX-r.left,e.clientY-r.top);
 });
 // Keyboard users can move across bars and choose the volume/money pane.
 canvas.tabIndex=0;
 canvas.setAttribute("aria-label",(kind==="daily"?"일봉":"분봉")+
   " 차트. 좌우 방향키로 봉 선택, 위아래 방향키로 거래량·거래대금 전환.");
 let keyboardPane="volume";
 canvas.addEventListener("keydown",e=>{
   if(!data.length||!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Escape"].includes(e.key))return;
   e.preventDefault();
   if(e.key==="Escape"){hideHover();return;}
   if(e.key==="ArrowDown")keyboardPane="turnover";
   if(e.key==="ArrowUp")keyboardPane="volume";
   if(activeIndex===null)activeIndex=windowRange.start+windowRange.count-1;
   if(e.key==="ArrowLeft")activeIndex=Math.max(windowRange.start,activeIndex-1);
   if(e.key==="ArrowRight")activeIndex=Math.min(windowRange.start+windowRange.count-1,activeIndex+1);
   const w=canvas.getBoundingClientRect().width,h=canvas.getBoundingClientRect().height;
   const x=68+(activeIndex-windowRange.start+.5)*(w-68-75)/windowRange.count;
   const y=keyboardPane==="volume"?Math.round(h*.69):Math.round(h*.85);
   showHover(activeIndex,keyboardPane,x,y);
   inspect(activeIndex);
 });
 canvas.addEventListener("blur",hideHover);
 if(typeof ResizeObserver!=="undefined")new ResizeObserver(render).observe(area);
 window.addEventListener("resize",render);
 updateButtons();render();
 return {setData,reset:resetView};
}
