import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {aggregateDailyBars,dailyPeriodKey,calendarGuides,chartAnchor,rangeForSelection} from "../market/daily-periods.mjs";
import {describeBarHover} from "../market/chart-hover.mjs";
import {checkedBars,scaleWindow} from "../market/chart-model.mjs";
import {movingAverage} from "../market/moving-average.mjs";
const bar=(date,open,high,low,close,volume,turnover=volume*close)=>({
 date,open,high,low,close,volume,turnover,turnoverVerified:true});
const source=[
 bar("2026-01-30",100,110,95,102,100,10000),
 bar("2026-02-02",103,108,96,105,200,21000),
 bar("2026-02-03",106,120,101,113,300,35000),
 bar("2026-02-06",113,116,110,112,200,23000),
 bar("2026-02-09",114,119,105,106,100,11000),
 bar("2026-02-27",107,115,100,114,400,40000),
 bar("2026-03-02",114,125,112,119,150,18000)
];
test("ISO weeks start Monday and span years correctly",()=>{
 assert.equal(dailyPeriodKey("2026-01-01","weekly"),"2025-12-29");
 assert.equal(dailyPeriodKey("2026-02-02","weekly"),"2026-02-02");
 assert.equal(dailyPeriodKey("2026-03-02","monthly"),"2026-03");
 assert.throws(()=>dailyPeriodKey("2026-02-02","hourly"));
});
test("weekly bars preserve real first-open, maximum high, minimum low, last close and sum volume",()=>{
 const out=aggregateDailyBars(source,"weekly");
 assert.equal(out.length,5);
 assert.equal(out[1].periodKey,"2026-02-02");
 assert.equal(out[1].date,"2026-02-06");
 assert.deepEqual([out[1].open,out[1].high,out[1].low,out[1].close,out[1].volume],
                  [103,120,96,112,700]);
 assert.equal(out[1].turnover,79000);
 assert.equal(out[1].dayCount,3);
});
test("monthly bars group by Korean calendar dates and preserve actual last day of group",()=>{
 const out=aggregateDailyBars(source,"monthly");
 assert.equal(out.length,3);
 assert.equal(out[0].date,"2026-01-30");
 assert.equal(out[1].date,"2026-02-27");
 assert.deepEqual([out[1].open,out[1].high,out[1].low,out[1].close,out[1].volume],
                  [103,120,96,114,1200]);
 assert.equal(out[2].date,"2026-03-02");
});
test("weekly and monthly never turn missing daily trade money into a verified estimate",()=>{
 const broken=source.map(x=>({...x}));
 broken[2]={...broken[2],turnoverVerified:false,turnover:null};
 for(const period of ["weekly","monthly"]){
   const out=aggregateDailyBars(broken,period);
   const issue=out.find(x=>x.firstDate<="2026-02-03"&&x.lastDate>="2026-02-03");
   assert.equal(issue.turnoverVerified,false);
   assert.equal(issue.turnover,null);
 }
});
test("input bar order does not affect grouping and invalid bars are skipped",()=>{
 const out=aggregateDailyBars([source[3],source[0],source[1],source[2],{date:"bad",close:0}],"weekly");
 assert.equal(out.length,2);
 assert.equal(out[1].close,112);
});
test("SMA on 240 weekly/monthly periods must use 240 aggregated bars, not 240 daily bars",()=>{
 const days=Array.from({length:280},(_,i)=>{
   const date=new Date(Date.UTC(2024,0,1)+i*86400000).toISOString().slice(0,10);
   return bar(date,100,120,90,100+i/10,10);
 });
 const weekly=aggregateDailyBars(days,"weekly");
 assert.ok(weekly.length<240);
 assert.equal(movingAverage(weekly,240).at(-1),null);
 assert.ok(movingAverage(days,240).at(-1)!==null);
});
test("year and month calendar transitions match true source dates",()=>{
 const bars=[bar("2025-12-30",100,105,90,102,1),
   bar("2025-12-31",100,105,90,102,1),
   bar("2026-01-02",100,105,90,102,1),
   bar("2026-02-02",100,105,90,102,1),
   bar("2026-02-03",100,105,90,102,1)];
 const guides=calendarGuides(bars,0,bars.length,"daily");
 assert.deepEqual(guides,[
   {index:2,type:"year",label:"2026년"},
   {index:3,type:"month",label:"2월"}
 ]);
 assert.deepEqual(calendarGuides(bars,0,bars.length,"weekly"),[guides[0]]);
});
test("zoomed viewport boundary only appears if real calendar period changed",()=>{
 const rows=source;
 assert.deepEqual(calendarGuides(rows,2,2,"daily"),[]);
 assert.equal(calendarGuides(rows,1,2,"daily").length,1);
});
test("chart pointer anchor excludes price axes, clamps outside graph",()=>{
 assert.equal(chartAnchor(68,600),0);
 assert.equal(chartAnchor(600-75,600),1);
 assert.equal(chartAnchor(68+(600-143)*.5,600),.5);
 assert.equal(chartAnchor(-50,600),0);
 assert.equal(chartAnchor(9999,600),1);
});
test("click-centred zoom math keeps focused bar near the same screen ratio",()=>{
 const curr={start:100,count:80},index=130;
 const ratio=(index+.5-curr.start)/curr.count;
 const zoomed=scaleWindow(1200,curr,.5,ratio);
 const newRatio=(index+.5-zoomed.start)/zoomed.count;
 assert.ok(Math.abs(newRatio-ratio)<.04);
});
test("shift-drag selection zoom clamps to at least five real bars and preserves selected range",()=>{
 assert.deepEqual(rangeForSelection({start:0,count:200},300,140,157),{start:140,count:18});
 assert.deepEqual(rangeForSelection({start:0,count:200},300,157,140),{start:140,count:18});
 const tiny=rangeForSelection({start:0,count:200},300,150,152);
 assert.equal(tiny.count,5);
 assert.ok(tiny.start<=150&&tiny.start+tiny.count>152);
});
test("price tooltips show OHLC with no long pressure explanation for day/week/month",()=>{
 const weekly=aggregateDailyBars(source,"weekly")[1];
 const tip=describeBarHover(weekly,"daily","price");
 assert.deepEqual(tip.ohlc,{시가:"103원",고가:"120원",종가:"112원",저가:"96원"});
 assert.equal(tip.note,"");
 assert.doesNotMatch(JSON.stringify(tip),/압력|체결 방향|매집/);
});
test("chart UI has three selections, click-pin zoom and Shift+drag range zoom",()=>{
 const html=readFileSync(new URL("../market/index.html",import.meta.url),"utf8");
 const code=readFileSync(new URL("../market/candle-chart.mjs",import.meta.url),"utf8");
 const auto=readFileSync(new URL("../market/auto-charts.mjs",import.meta.url),"utf8");
 assert.match(html,/id="chart-daily-period"/);
 assert.match(html,/<option value="weekly">주봉<\/option>/);
 assert.match(html,/<option value="monthly">월봉<\/option>/);
 assert.match(auto,/daily\.setTimeframe\(mode\)/);
 assert.match(code,/lockedFocus=\{index:i\}/);
 assert.match(code,/selectionDrag/);
 assert.match(code,/calendarGuides\(data/);
});
