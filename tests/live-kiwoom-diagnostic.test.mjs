import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {explainLiveKiwoom} from "../market/live-kiwoom-diagnostic.mjs";
const ui=readFileSync(new URL("../market/auto-charts.mjs",import.meta.url),"utf8");
const html=readFileSync(new URL("../market/index.html",import.meta.url),"utf8");
test("successful catalog check is not over-claimed as successful chart",()=>{
 const d=explainLiveKiwoom("OK","STOCK_LIST","VERIFIED_READ_ONLY");
 assert.equal(d.ok,true);
 assert.match(d.text,/종목목록 조회 성공/);
 assert.doesNotMatch(d.text,/일봉 조회 성공/);
});
test("OAuth 401 is distinguishable from stock-list 401",()=>{
 const a=explainLiveKiwoom("FAILED","OAUTH","HTTP_401");
 const b=explainLiveKiwoom("FAILED","STOCK_LIST","HTTP_401");
 assert.match(a.text,/접근토큰 단계/);
 assert.match(b.text,/종목목록/);
 assert.match(a.text,/HTTP 401/);
});
test("market-data chart failures are distinct from cached local auth status",()=>{
 const r=explainLiveKiwoom("FAILED","CHART","HTTP_429");
 assert.equal(r.stage,"CHART");
 assert.match(r.text,/차트 시세/);
 assert.match(r.text,/요청이 너무 많/);
});
test("provider rejected highlights permission without leaking server payload",()=>{
 const r=explainLiveKiwoom("FAILED","STOCK_LIST","PROVIDER_REJECTED");
 assert.match(r.text,/요청을 거부/);
});
test("unrecognized stage and reason are never echoed",()=>{
 const r=explainLiveKiwoom("FAILED","VERY_SECRET_KEY","SECRET_IN_RAW_MESSAGE");
 assert.equal(r.reason,"UNEXPECTED_RESPONSE");
 assert.doesNotMatch(JSON.stringify(r),/VERY_SECRET|SECRET_IN_RAW/);
});
test("only user click triggers the live diagnostics call",()=>{
 assert.match(ui,/liveButton\.addEventListener\("click",async\(\)=>\{/);
 assert.match(ui,/await localJson\("\/diagnose"/);
 assert.doesNotMatch(ui,/setInterval\([^)]*diagnose/);
});
test("a catalog failure still reveals a diagnostic button after health was ready",()=>{
 assert.match(ui,/diagnostic\.hidden=false;\s*diagnosticText\.textContent="인증파일은 읽었지만 키움 서버/);
 assert.match(html,/id="chart-live-diagnose"/);
 assert.match(html,/id="chart-live-result"/);
});
test("localJson preserves only stage and reason from generic error body",()=>{
 assert.match(ui,/error\.stage=body\?\.stage/);
 assert.match(ui,/error\.reason=body\?\.reason/);
 assert.match(ui,/explainLiveKiwoom\("FAILED",err\.stage,err\.reason\)/);
});
