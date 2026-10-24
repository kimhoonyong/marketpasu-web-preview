import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dragMode,rangeFromMouseDrag} from "../market/chart-mouse-gestures.mjs";
const source=readFileSync(new URL("../market/candle-chart.mjs",import.meta.url),"utf8");
const html=readFileSync(new URL("../market/index.html",import.meta.url),"utf8");
const start={start:250,count:200};
test("left-button mode zooms and right-button mode pans",()=>{
 assert.equal(dragMode(0),"zoom");
 assert.equal(dragMode(2),"pan");
 assert.equal(dragMode(1),null);
 assert.equal(dragMode(9),null);
});
test("left drag RIGHT smoothly zooms IN from original 200 bars",()=>{
 const near=rangeFromMouseDrag(1200,start,80,900,.5,"zoom");
 const far=rangeFromMouseDrag(1200,start,240,900,.5,"zoom");
 assert.ok(near.count<200);
 assert.ok(far.count<near.count);
 assert.ok(far.count>=5);
});
test("left drag LEFT zooms OUT and preserves the original selected bar",()=>{
 const zoomed=rangeFromMouseDrag(1200,start,-220,900,.25,"zoom");
 assert.ok(zoomed.count>start.count);
 const focus=start.start+start.count*.25;
 const newFocus=zoomed.start+zoomed.count*.25;
 assert.ok(Math.abs(focus-newFocus)<=2);
});
test("dragging back to original coordinate returns exact initial range, avoiding drift",()=>{
 const changed=rangeFromMouseDrag(1200,start,190,900,.36,"zoom");
 assert.ok(changed.count<start.count);
 assert.deepEqual(rangeFromMouseDrag(1200,start,0,900,.36,"zoom"),start);
});
test("right-drag scrolls horizontally without changing zoom level",()=>{
 const right=rangeFromMouseDrag(1200,start,180,900,.6,"pan");
 const left=rangeFromMouseDrag(1200,start,-180,900,.6,"pan");
 assert.equal(right.count,200);
 assert.equal(left.count,200);
 assert.ok(right.start<start.start);
 assert.ok(left.start>start.start);
});
test("pan and zoom stop at historical edges",()=>{
 const x=rangeFromMouseDrag(600,{start:0,count:100},99999,700,.2,"pan");
 assert.equal(x.start,0);
 const y=rangeFromMouseDrag(600,{start:450,count:150},-99999,700,.3,"pan");
 assert.equal(y.start,450);
 const z=rangeFromMouseDrag(600,start,10000,700,.5,"zoom");
 assert.equal(z.count,5);
 const full=rangeFromMouseDrag(600,start,-10000,700,.5,"zoom");
 assert.equal(full.count,600);
});
test("small mouse jitter is below five-pixel activation threshold in input handlers",()=>{
 assert.match(source,/if\(Math\.abs\(delta\)>=5\)mouseDrag\.moved=true/);
});
test("one-finger touch pan, two-finger pinch and wheel remain supported",()=>{
 assert.match(source,/e\.pointerType!=="touch"\)return/);
 assert.match(source,/pointers\.size===2/);
 assert.match(source,/canvas\.addEventListener\("wheel"/);
 assert.match(source,/canvas\.addEventListener\("contextmenu",e=>\{e\.preventDefault\(\)/);
});
test("chart interaction preserves simple click focus, but does not require Shift",()=>{
 assert.match(source,/lockedFocus=\{index:i\}/);
 assert.match(source,/rangeFromMouseDrag\(data.length,mouseDrag\.initial,delta/);
 assert.match(source,/mouseDrag\.button===0/);
 assert.match(source,/dragMode\(e\.button\)/);
 assert.match(html,/왼쪽 버튼을 누른 채 오른쪽으로 드래그하면 확대/);
 assert.match(html,/오른쪽 버튼 드래그로 좌우 이동/);
});
test("invalid mouse movement cannot break visible range",()=>{
 assert.deepEqual(rangeFromMouseDrag(0,start,100,900,.5,"zoom"),{start:0,count:0});
 assert.deepEqual(rangeFromMouseDrag(1200,start,NaN,900,.5,"zoom"),start);
 assert.deepEqual(rangeFromMouseDrag(1200,start,10,0,.5,"zoom"),start);
});
