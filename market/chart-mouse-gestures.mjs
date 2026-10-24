import {constrainRange,scaleWindow} from "./chart-model.mjs";

/** Horizontal mouse drags apply relative to the START window, not per-event.
 * Left -> drag right = zoom IN; left -> drag left = zoom OUT.
 * Right button -> drag horizontally = PAN, never zoom.
 * Runs only on existing loaded bars and does not request new market data.
 */
export function dragMode(button){
 return button===0?"zoom":button===2?"pan":null;
}
export function rangeFromMouseDrag(total,initial,dx,plotWidth,anchor,mode){
 if(!Number.isFinite(total)||total<=0)return {start:0,count:0};
 if(!initial||!Number.isFinite(initial.start)||!Number.isFinite(initial.count))return {start:0,count:0};
 if(!Number.isFinite(dx)||!Number.isFinite(plotWidth)||plotWidth<=0)return constrainRange(total,initial.start,initial.count);
 if(mode==="zoom"){
  // About 50% zoom-in after 160px right drag, symmetric zoom-out to left.
  // Absolute-from-start computation prevents accumulating drift and jitter.
  const factor=Math.exp(-Math.max(-1000,Math.min(1000,dx))/230);
  return scaleWindow(total,initial,factor,anchor);
 }
 if(mode==="pan"){
  const delta=Math.round(-dx/Math.max(1,plotWidth)*initial.count);
  return constrainRange(total,initial.start+delta,initial.count);
 }
 return constrainRange(total,initial.start,initial.count);
}
