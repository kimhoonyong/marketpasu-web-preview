import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {responsiveChartHeight,chartTextSize} from "../market/chart-sizing.mjs";
const css=readFileSync(new URL("../market/market.css",import.meta.url),"utf8");
const code=readFileSync(new URL("../market/candle-chart.mjs",import.meta.url),"utf8");
test("no hard 900/1640px container cap in last workstation layout",()=>{
 assert.match(css,/\.app\{\s*width:100%;\s*max-width:none;\s*margin:0;/);
 assert.match(css,/@media\(min-width:960px\)/);
 assert.match(css,/@media\(min-width:2400px\)/);
});
test("wide desktop puts searches side by side and dual charts on full row",()=>{
 assert.match(css,/\.app main>\.controls\{grid-column:1/);
 assert.match(css,/\.app main>\.stock-lookup\{grid-column:2/);
 assert.match(css,/\.app main>\.auto-chart-panel\.charts-wide\{\s*grid-column:1\/-1;width:100%;max-width:none/);
 assert.match(css,/@media\(min-width:1200px\)/);
 assert.match(css,/\.charts-wide \.chart-grids\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
test("CSS zoomed notebook and phone fallback to readable vertical dual charts",()=>{
 assert.match(css,/@media\(min-width:960px\) and \(max-width:1199px\)/);
 assert.match(css,/@media\(min-width:700px\) and \(max-width:959px\)/);
 assert.match(css,/@media\(max-width:699px\)/);
 assert.match(css,/\.charts-wide \.chart-grids\{grid-template-columns:1fr/);
});
test("16:10 laptop chart height adapts to actual chart width and available screen",()=>{
 const h=responsiveChartHeight(680,900);
 assert.ok(h>=440&&h<=700);
 assert.ok(h<900);
});
test("32 and 42-inch workstations get progressively more chart space",()=>{
 const laptop=responsiveChartHeight(680,900);
 const desktop=responsiveChartHeight(1170,1440);
 const big=responsiveChartHeight(1850,2160);
 assert.ok(desktop>laptop);
 assert.ok(big>desktop);
 assert.ok(big<=1300);
});
test("enlarged chart fills more of big viewport without fixed old 790px cap",()=>{
 assert.ok(responsiveChartHeight(1500,2160,true)>1600);
 assert.ok(responsiveChartHeight(680,900,true)<900);
});
test("mobile, low viewport and invalid dimensions handled safely",()=>{
 assert.ok(responsiveChartHeight(350,720)>=340);
 assert.equal(responsiveChartHeight(0,800),460);
 assert.equal(responsiveChartHeight(Number.NaN,800),460);
 assert.equal(chartTextSize(650),12);
 assert.equal(chartTextSize(1850),14);
});
test("canvas rerenders at responsive height while keeping zoom and hover",()=>{
 assert.match(code,/heightFor=w=>responsiveChartHeight/);
 assert.match(code,/h=heightFor\(w\)/);
 assert.match(code,/new ResizeObserver\(render\)\.observe\(area\)/);
 assert.match(code,/window\.addEventListener\("resize",render\)/);
 assert.match(code,/canvas\.addEventListener\("wheel"/);
 assert.match(code,/canvas\.addEventListener\("pointermove"/);
});
