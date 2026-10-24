import {checkedBars,constrainRange,scaleWindow,formatNumber} from "./chart-model.mjs";

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
 const colors={up:"#fa666b",down:"#6cb5ff",grid:"#36506a",text:"#afc4d5",wick:"#b4bfc9"};
 const info=(txt)=>{detail.textContent=txt;};
 const heightFor=()=>root.classList.contains("chart-enlarged")?Math.max(420,Math.min(window.innerHeight-190,770)):310;
 function render(){
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
  const left=58,right=65,top=20,priceBottom=Math.round(h*.72),volTop=priceBottom+22,volBottom=h-34;
  const graphWidth=w-left-right,each=graphWidth/visible.length;
  let low=Math.min(...visible.map(v=>v.low)),high=Math.max(...visible.map(v=>v.high));
  const pad=(high-low||high*.02)*.08;
  low-=pad;high+=pad;
  const yp=price=>priceBottom-(price-low)/(high-low)*(priceBottom-top);
  const volumeMax=Math.max(1,...visible.map(v=>v.volume));
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
  }
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
  const first=visible[0],last=visible[visible.length-1];
  info(label+" · "+first.date.replace("T"," ")+" ~ "+last.date.replace("T"," ")+" · "+visible.length+"봉 / "+data.length+"봉 · 마지막 "+formatNumber(last.close)+"원 · 거래량 "+formatNumber(last.volume));
 }
 function setData(rows){
   data=checkedBars(rows,kind);
   const visible=kind==="daily"?Math.min(data.length,60):Math.min(data.length,160);
   windowRange=constrainRange(data.length,data.length-visible,visible);
   render();
 }
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
 reset.addEventListener("click",()=>setData(data));
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
 canvas.addEventListener("pointercancel",end);
 canvas.addEventListener("lostpointercapture",end);
 if(typeof ResizeObserver!=="undefined")new ResizeObserver(render).observe(area);
 window.addEventListener("resize",render);
 render();
 return {setData,reset:()=>setData(data)};
}
