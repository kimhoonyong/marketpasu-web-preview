import {authTransition} from "./auth-state.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {SAMPLE_NEWS,normalizedTrialRows,filterIntegrated,demoMetrics,trialMetrics} from "./data-model.mjs";
import {createSessionLimiter,validateTrialConfig} from "../auth-trial/trial-policy.mjs";
const read=path=>readFileSync(fileURLToPath(new URL(path,import.meta.url)),"utf8");

test("demo: exactly 8 fictional records offline",()=>{
  assert.equal(SAMPLE_NEWS.length,8);
  assert.equal(demoMetrics(SAMPLE_NEWS).repeat,2);
  assert.equal(demoMetrics(SAMPLE_NEWS).changed,2);
  assert.equal(filterIntegrated(SAMPLE_NEWS,{source:"demo",status:"repeat"}).length,2);
  assert.equal(filterIntegrated(SAMPLE_NEWS,{source:"demo",text:"가상기업 F",mode:"stock"}).length,1);
  assert.equal(filterIntegrated(SAMPLE_NEWS,{source:"demo",text:"제품",mode:"news"}).length>0,true);
});
test("trial: count capped at 10 even when caller passes more rows",()=>{
  const rows=Array.from({length:18},(_,i)=>({id:"id-"+i,data:{title:"title"+i,publisher:"test",collectedAt:"2026-10-22"}}));
  const normalized=normalizedTrialRows(rows);
  assert.equal(normalized.length,10);
  assert.equal(normalized.at(-1).id,"id-9");
  assert.equal(trialMetrics(normalized).review,null);
});
test("trial: only allowlisted fields survive into model",()=>{
  const [item]=normalizedTrialRows([{id:"safe",data:{title:" headline ",publisher:"lab",collectedAt:"ISO",secret:"DO_NOT_LEAK",uid:"DO_NOT_LEAK"}}]);
  assert.deepEqual(Object.keys(item),["id","title","publisher","collectedAt","source"]);
  assert.equal(JSON.stringify(item).includes("DO_NOT_LEAK"),false);
});
test("trial: Unicode local search does not trigger server request",()=>{
  const rows=normalizedTrialRows([{id:"test",data:{title:"[가상] 삼성 테스트",publisher:"합성신문",collectedAt:"2026"}}]);
  assert.equal(filterIntegrated(rows,{source:"trial",text:"삼성",mode:"news"}).length,1);
  assert.equal(filterIntegrated(rows,{source:"trial",text:"합성신문",mode:"stock"}).length,1);
  assert.equal(filterIntegrated(rows,{source:"trial",text:"없는문구",mode:"all"}).length,0);
});
test("trial: limiter permits one attempt, then rejects even retry",()=>{
  const limiter=createSessionLimiter();
  assert.equal(limiter.canRead(),true);
  assert.equal(limiter.reserve(),true);
  assert.equal(limiter.canRead(),false);
  assert.equal(limiter.reserve(),false);
  assert.equal(limiter.count(),1);
});
test("trial: production or unexpected Firebase project rejected",()=>{
  const ok={enabled:true,projectType:"ISOLATED_TRIAL_NO_PRODUCTION",collection:"trialNews",maxDocs:10,maxSessionQueries:1,
    firebase:{apiKey:"AIza"+"Z".repeat(40),authDomain:"marketpasu-auth-trial.firebaseapp.com",projectId:"marketpasu-auth-trial",appId:"1:123:web:abcdef"}};
  assert.equal(validateTrialConfig(ok,"kimhoonyong.github.io"),"READY_FOR_USER_APPROVED_TRIAL_ONLY");
  assert.notEqual(validateTrialConfig({...ok,firebase:{...ok.firebase,projectId:"stocknewsmonitor-13b98"}},"kimhoonyong.github.io"),"READY_FOR_USER_APPROVED_TRIAL_ONLY");
  assert.notEqual(validateTrialConfig(ok,"random.example.com"),"READY_FOR_USER_APPROVED_TRIAL_ONLY");
});
test("UI integration: source switch, manual read, logout wiping and safe display",()=>{
  const html=read("./index.html"),app=read("./integrated-app.mjs"),style=read("./integrated.css");
  for(const id of ["mode-demo","mode-trial","auth-panel","sign-in","sign-out","fetch-trial",
    "search-mode","search-input","filter-select","article-list","trial-feedback"])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(app,/onAuthStateChanged/);
  assert.match(app,/firebaseAuth\.signOut\(auth\)/);
  assert.match(app,/getDocsFromServer\(q\)/);
  assert.match(app,/firestore\.limit\(MAX_QUERY_DOCS\)/);
  assert.match(app,/!attempt\.reserve\(\)/);
  assert.match(app,/resetTrialData\(\)/);
  assert.match(app,/ui\.list\.replaceChildren\(frag\)/);
  assert.match(app,/setAttribute\("aria-pressed"/);
  assert.match(app,/textContent/);
  assert.match(style,/@media\(max-width:650px\)/);
  for(const disallowed of ["onSnapshot(","setDoc(","addDoc(","updateDoc(","deleteDoc(","signInWithRedirect(","localStorage","sessionStorage","innerHTML=","stocknewsmonitor-13b98"]){
    assert.equal(app.includes(disallowed),false,disallowed+" must not appear");
  }
});
test("Root demo and prior auth trial remain independent, no build-time cloud activity",()=>{
  const html=read("./index.html");
  const app=read("./integrated-app.mjs");
  assert.match(html,/href="\.\.\/site\.css"/);
  assert.match(app,/import\("\.\.\/auth-trial\/config\.trial\.mjs"\)/);
  assert.match(html,/가상 뉴스 8건/);
  assert.match(app,/source==="trial"/);
  assert.match(app,/ui\.statusFilter\.disabled=trial/);
});

test("auth state: first visit is login prompt, not misleading logout confirmation",()=>{
  const a=authTransition({previousUid:"",nextUid:""});
  assert.equal(a.label,"로그아웃");
  assert.match(a.message,/로그인 전/);
  assert.equal(a.message.includes("로그아웃 완료"),false);
  assert.equal(a.shouldClear,false);
});
test("auth state: login clears stale logout feedback and does not invent approval",()=>{
  const a=authTransition({previousUid:"",nextUid:"simulated-id",previousReadState:"not_attempted"});
  assert.equal(a.label,"승인 확인 전");
  assert.match(a.message,/로그인 성공/);
  assert.match(a.message,/아직 미확인/);
  assert.equal(a.verified,false);
  assert.equal(a.shouldClear,true);
});
test("auth state: successful server query survives same-UID callbacks",()=>{
  const a=authTransition({previousUid:"simulated-id",nextUid:"simulated-id",previousReadState:"success"});
  assert.equal(a.label,"조회 허용 확인");
  assert.equal(a.message,null);
  assert.equal(a.verified,true);
  assert.equal(a.shouldClear,false);
});
test("auth state: logout wipes data and returns to sign-in",()=>{
  const a=authTransition({previousUid:"simulated-id",nextUid:"",previousReadState:"success"});
  assert.equal(a.label,"로그아웃");
  assert.match(a.message,/로그아웃 완료/);
  assert.equal(a.shouldClear,true);
  assert.equal(a.verified,false);
});
test("auth state: switching signed-in users wipes data and does not retain approval",()=>{
  const a=authTransition({previousUid:"user-a",nextUid:"user-b",previousReadState:"success"});
  assert.equal(a.label,"승인 확인 전");
  assert.equal(a.shouldClear,true);
  assert.equal(a.verified,false);
});
test("UI v0.2: larger touch targets and font sizes with single manual read",()=>{
  const html=read("./index.html");
  const css=read("./integrated.css");
  const app=read("./integrated-app.mjs");
  assert.match(html,/integrated-v02/);
  assert.match(html,/Google 로그인 및 시험 DB 조회/);
  assert.match(css,/min-height:54px/);
  assert.match(css,/font-size:16px/);
  assert.match(css,/@media\(max-width:580px\)/);
  assert.match(app,/authTransition\(/);
  assert.match(app,/ui\.feedback\.textContent=next\.message/);
  assert.match(app,/source!=="trial"\|\|!signedIn/);
  assert.match(app,/!attempt\.reserve\(\)/);
  assert.match(app,/firestore\.limit\(MAX_QUERY_DOCS\)/);
  for(const s of ["onSnapshot(","setDoc(","addDoc(","updateDoc(","deleteDoc(","innerHTML=","stocknewsmonitor-13b98"]){
    assert.equal(app.includes(s),false,s);
  }
});
