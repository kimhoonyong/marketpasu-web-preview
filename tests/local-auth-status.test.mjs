import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {localAuthExplanation} from "../market/local-auth-status.mjs";
const render=readFileSync(new URL("../market/auto-charts.mjs",import.meta.url),"utf8");
const html=readFileSync(new URL("../market/index.html",import.meta.url),"utf8");

test("auth state ready is not yet claimed to be a live Kiwoom market-data test",()=>{
 const info=localAuthExplanation(true,"SCOUT_CREDENTIALS_READY");
 assert.equal(info.state,"ready");
 assert.match(info.guide,/실제 키움 시세 응답/);
});
test("missing existing module points only to expected local file path",()=>{
 const x=localAuthExplanation(false,"EXISTING_MODULE_NOT_FOUND");
 assert.match(x.heading,/모듈/);
 assert.match(x.guide,/secure_credentials\.py/);
 assert.doesNotMatch(x.guide,/인증키 값/);
});
test("missing vault never suggests recreating or uploading stored credentials",()=>{
 const x=localAuthExplanation(false,"EXISTING_VAULT_NOT_FOUND");
 assert.match(x.guide,/kiwoom_rest_credentials\.bin/);
 assert.match(x.guide,/파일을 새로 만들거나 복사하지 말고/);
});
test("load failed advises same Windows user without leaking vault contents",()=>{
 const x=localAuthExplanation(false,"EXISTING_AUTH_LOAD_FAILED");
 assert.match(x.guide,/동일 Windows 사용자/);
 assert.match(x.heading,/복호화/);
});
test("unsupported auth format is distinct from missing file",()=>{
 const x=localAuthExplanation(false,"EXISTING_AUTH_FORMAT_UNSUPPORTED");
 assert.match(x.heading,/반환 형식/);
});
test("unknown status safely falls back without concatenating untrusted error text",()=>{
 const x=localAuthExplanation(false,"DANGEROUS_SECRET_ABC123");
 assert.doesNotMatch(JSON.stringify(x),/DANGEROUS_SECRET/);
});
test("web UI reads /health authStatus and allows manual status recheck",()=>{
 assert.match(render,/localAuthExplanation\(d\.authConfigured===true,d\.authStatus\)/);
 assert.match(render,/chart-auth-recheck/);
 assert.match(html,/id="chart-auth-diagnostics"/);
 assert.match(html,/id="chart-auth-recheck"/);
});
