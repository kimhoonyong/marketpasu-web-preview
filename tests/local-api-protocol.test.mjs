import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {EXPECTED_PROTOCOL,localApiCompatibility,localApiHelp} from "../market/local-api-protocol.mjs";
const server=readFileSync(new URL("../integrations/kiwoom/marketpasu_local_chart_server.py",import.meta.url),"utf8");
const ui=readFileSync(new URL("../market/auto-charts.mjs",import.meta.url),"utf8");
const valid={protocol:EXPECTED_PROTOCOL,protocolVersion:3,routes:["health","symbols","chart","diagnose"],authConfigured:true,authStatus:"SCOUT_CREDENTIALS_READY"};
test("current local chart bridge advertises required routes and version",()=>{
 assert.deepEqual(localApiCompatibility(valid),{compatible:true,reason:"COMPATIBLE"});
 assert.match(server,/LOCAL_API_PROTOCOL="marketpasu-local-v3"/);
 assert.match(server,/"protocol":LOCAL_API_PROTOCOL/);
});
test("previous old bridge with healthy credentials cannot masquerade as compatible",()=>{
 assert.deepEqual(localApiCompatibility({authConfigured:true,authStatus:"SCOUT_CREDENTIALS_READY"}),{compatible:false,reason:"OUTDATED_LOCAL_SERVER"});
 assert.match(localApiHelp("OUTDATED_LOCAL_SERVER"),/검은색 기존 연결창을 모두 닫고/);
});
test("mismatched protocol version is shown as old bridge, not Kiwoom OAuth failure",()=>{
 assert.equal(localApiCompatibility({...valid,protocolVersion:2}).reason,"OUTDATED_LOCAL_SERVER");
 assert.equal(localApiCompatibility({...valid,protocol:"some-other"}).reason,"OUTDATED_LOCAL_SERVER");
});
test("required route missing is recognized independently from authentication",()=>{
 const z=localApiCompatibility({...valid,routes:["health","chart","diagnose"]});
 assert.equal(z.reason,"MISSING_API_ROUTES");
});
test("unrecognized service and malformed route declarations fail closed",()=>{
 assert.equal(localApiCompatibility(null).reason,"UNRECOGNIZED_SERVICE");
 assert.equal(localApiCompatibility({...valid,routes:"health,symbols,chart,diagnose"}).reason,"MISSING_API_ROUTES");
});
test("browser checks protocol during health before any stock search",()=>{
 assert.match(ui,/const compatibility=localApiCompatibility\(d\)/);
 assert.match(ui,/localProtocolReady=compatibility.compatible/);
 assert.match(ui,/if\(!localProtocolReady && !await health\(\)\)/);
 assert.match(ui,/localApiHelp\(compatibility.reason\)/);
});
test("exact 404 message from old bridge is not labeled as broker rejection",()=>{
 assert.match(server,/"error":"알 수 없는 요청입니다."/);
 assert.match(ui,/err\?\.httpStatus===404/);
 assert.match(ui,/error\.httpStatus=response.status/);
});
test("no live broker diagnostic is sent before protocol is checked",()=>{
 assert.match(ui,/if\(!await health\(\)\)/);
 assert.match(ui,/await localJson\("\/diagnose"/);
});
