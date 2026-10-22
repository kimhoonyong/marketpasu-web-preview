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
