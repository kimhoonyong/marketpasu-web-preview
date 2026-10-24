import test from "node:test";
import assert from "node:assert/strict";
import {panelAt,hoveredBarIndex,describeBarHover,hoverSurface} from "../market/chart-hover.mjs";

const day={
 date:"2026-10-23",open:9000,high:11000,low:8500,close:10000,
 volume:1250040,turnover:12500400000,turnoverVerified:true
};
const minute={
 date:"2026-10-23T09:18:00+09:00",open:8900,high:9200,low:8800,close:9100,
 volume:2500,turnover:null,turnoverVerified:false,partial:true
};
test("hover hit tests identify volume and money subpanels in 460px chart",()=>{
 assert.equal(panelAt(305,460),"volume");
 assert.equal(panelAt(370,460),"turnover");
 assert.equal(panelAt(155,460),"price");
 assert.equal(panelAt(280,460),null);
 assert.equal(panelAt(357,460),null);
 assert.equal(panelAt(450,460),null);
});
test("panel hit zones scale with enlarged chart height",()=>{
 assert.equal(panelAt(525,780),"volume");
 assert.equal(panelAt(670,780),"turnover");
 assert.equal(panelAt(200,780),"price");
});
test("hover pointer maps to visible bars with zoom/pan start offset",()=>{
 const range={start:50,count:20};
 assert.equal(hoveredBarIndex(68,600,range),50);
 assert.equal(hoveredBarIndex(68+(600-68-75)*.5,600,range),60);
 assert.equal(hoveredBarIndex(600-75,600,range),69);
 assert.equal(hoveredBarIndex(67,600,range),null);
 assert.equal(hoveredBarIndex(600-74,600,range),null);
});
test("zoom supports one actual candle without off by one",()=>{
 assert.equal(hoveredBarIndex(200,600,{start:3,count:1}),3);
 assert.equal(hoveredBarIndex(200,130,{start:3,count:1}),null);
 assert.equal(hoveredBarIndex(200,600,{start:0,count:0}),null);
});
test("hover on daily volume shows precise individual shares and selected date",()=>{
 const v=describeBarHover(day,"daily","volume");
 assert.equal(v.time,"2026-10-23");
 assert.equal(v.heading,"거래량");
 assert.equal(v.value,"1,250,040주");
 assert.match(v.note,/일봉/);
});
test("hover on minute volume preserves original minute and missing-bar warning",()=>{
 const v=describeBarHover(minute,"minute","volume");
 assert.equal(v.time,"2026-10-23 09:18");
 assert.equal(v.value,"2,500주");
 assert.match(v.note,/누락/);
});
test("hover on daily turnover uses Kiwoom confirmed value, not volume proxy",()=>{
 const m=describeBarHover(day,"daily","turnover");
 assert.equal(m.time,"2026-10-23");
 assert.match(m.heading,/키움 일봉 제공/);
 assert.equal(m.value,"12,500,400,000원");
 assert.match(m.note,/125억/);
});
test("hover on minute turnover labels close-times-volume as estimate",()=>{
 const m=describeBarHover(minute,"minute","turnover");
 assert.equal(m.time,"2026-10-23 09:18");
 assert.equal(m.value,"22,750,000원");
 assert.match(m.heading,/추정치/);
 assert.match(m.note,/실제 체결대금 아님/);
});
test("missing broker-reported day turnover stays missing, never reconstructed",()=>{
 const m=describeBarHover({...day,turnoverVerified:false},"daily","turnover");
 assert.equal(m.value,"실제 거래대금 미제공");
 assert.doesNotMatch(m.note,/추정 거래대금/);
});
test("unsupported kind and invalid pane do not present fabricated data",()=>{
 assert.match(describeBarHover(day,"daily","price").heading,/가격봉/);
 assert.equal(describeBarHover(null,"daily","volume"),null);
});
test("five-minute resampled bar carries actual summed volume in tooltip",()=>{
 const row={...minute,date:"2026-10-23T10:00:00+09:00",volume:12000,partial:false};
 assert.equal(describeBarHover(row,"minute","volume").value,"12,000주");
 assert.equal(describeBarHover(row,"minute","turnover").value,"109,200,000원");
});

test("OHLC price hover is OFF by default and never opens a blocking popup",()=>{
 assert.equal(hoverSurface("price"),"none");
 assert.equal(hoverSurface("price",false),"none");
});
test("enabled OHLC uses an outside-chart strip, not the floating plot popup",()=>{
 assert.equal(hoverSurface("price",true),"strip");
});
test("volume and monetary tooltips remain available whether OHLC is on or off",()=>{
 for(const state of [true,false]){
   assert.equal(hoverSurface("volume",state),"tooltip");
   assert.equal(hoverSurface("turnover",state),"tooltip");
 }
 assert.equal(hoverSurface(null,true),"none");
});
