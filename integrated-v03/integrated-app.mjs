import {SAMPLE_NEWS,normalizedTrialRows,filterIntegrated,demoMetrics,trialMetrics,STATES} from "./data-model.mjs";
import {LABELS} from "../demo-data.mjs";
import {authTransition} from "./auth-state.mjs";
import {MAX_QUERY_DOCS,TRIAL_COLLECTION,validateTrialConfig,createSessionLimiter,safeDisplayText} from "../auth-trial/trial-policy.mjs";

const el=id=>document.getElementById(id);
const ui={
  modeDemo:el("mode-demo"),modeTrial:el("mode-trial"),authPanel:el("auth-panel"),
  authBadge:el("auth-badge"),authInfo:el("auth-info"),accountState:el("account-state"),
  uid:el("trial-uid"),copyUid:el("copy-uid"),login:el("sign-in"),logout:el("sign-out"),
  fetch:el("fetch-trial"),feedback:el("trial-feedback"),
  search:el("search-input"),searchMode:el("search-mode"),statusFilter:el("filter-select"),
  reset:el("reset-filters"),list:el("article-list"),empty:el("empty-state"),
  emptyTitle:el("empty-title"),emptyDescription:el("empty-description"),
  searchSummary:el("search-summary"),readSummary:el("read-summary"),help:el("search-help"),
  notice:el("feed-notice"),feedLabel:el("feed-mode-label"),totalHelp:el("metric-total-help")
};
const attempt=createSessionLimiter();
let source="demo";
let trialRows=[];
let trialReadState="not_attempted";
let firebaseAuth=null,firestore=null,auth=null,db=null;
let firebaseReady=false;
let signedIn=false,uid="",busy=false;

function node(tag,cls,text){
  const out=document.createElement(tag);
  if(cls)out.className=cls;
  if(text!==undefined)out.textContent=String(text);
  return out;
}
function makeDemoCard(item){
  const card=node("article","article");
  const head=node("div","article-top");
  head.append(node("span","tag "+item.status,LABELS[item.status]),
    node("span","muted",item.stock+" · "+item.category),
    node("span","muted","가상 기록 "+item.id));
  card.append(head,node("h3","",item.title),node("p","",item.description));
  const stats=node("div","article-stats");
  stats.append(node("span","","최초 보도 "+item.firstPublished),
    node("span","","최근 관측 "+item.lastSeen),
    node("span","","관측 횟수 "+item.observations+"회"));
  card.append(stats);
  const more=node("details","");
  more.append(node("summary","","관측 이력 자세히 보기"));
  const grid=node("div","detail-grid");
  for(const [title,value] of [
    ["최초 보도(가상)",item.firstPublished],["최초 수집(가상)",item.firstCollected],
    ["최근 관측(가상)",item.lastSeen]
  ]){
    const cell=node("div","");
    cell.append(node("small","",title),node("strong","",value));
    grid.append(cell);
  }
  more.append(grid,node("p","muted","이 기록은 가상의 예시이며 실제 기사 또는 투자 정보가 아닙니다."));
  card.append(more);
  return card;
}
function makeTrialCard(item){
  const card=node("article","article");
  const head=node("div","article-top");
  head.append(node("span","tag normal","시험 뉴스 · 상태 미판정"),
    node("span","muted","시험 문서 "+item.id));
  card.append(head,node("h3","",item.title),node("p","",item.publisher));
  const stats=node("div","article-stats");
  stats.append(node("span","","기록 시각 "+item.collectedAt),
    node("span","","실제 뉴스 여부 미검증"));
  card.append(stats);
  return card;
}
function refreshButtons(){
  ui.login.disabled=!firebaseReady||busy||signedIn;
  ui.logout.disabled=!firebaseReady||busy||!signedIn;
  ui.copyUid.disabled=!signedIn||!uid||busy;
  ui.fetch.disabled=!firebaseReady||!signedIn||busy||source!=="trial"||!attempt.canRead();
}
function setBusy(next){busy=next;refreshButtons();}
function setAuthBadge(label,state=""){
  ui.authBadge.textContent=label;
  ui.authBadge.className="auth-chip"+(state?" "+state:"");
}
function resetTrialData(){
  trialRows=[];
  trialReadState="not_attempted";
}
function setSource(next){
  if(next!=="demo"&&next!=="trial")return;
  source=next;
  const trial=source==="trial";
  ui.modeDemo.classList.toggle("current",!trial);
  ui.modeTrial.classList.toggle("current",trial);
  ui.modeDemo.setAttribute("aria-pressed",String(!trial));
  ui.modeTrial.setAttribute("aria-pressed",String(trial));
  ui.authPanel.hidden=!trial;
  ui.statusFilter.disabled=trial;
  ui.statusFilter.value="all";
  ui.search.value="";
  ui.searchMode.value="all";
  refreshButtons();
  render();
}
function render(){
  const trial=source==="trial";
  const records=trial?trialRows:SAMPLE_NEWS;
  const filtered=filterIntegrated(records,{
    text:ui.search.value,mode:ui.searchMode.value,
    status:ui.statusFilter.value,source
  });
  const metrics=trial?trialMetrics(filtered):demoMetrics(filtered);
  for(const [name,value] of Object.entries(metrics))el("metric-"+name).textContent=value===null?"—":String(value);
  ui.totalHelp.textContent=trial?"조회한 시험 뉴스 중 필터된 건수":"가상 데이터 검색 결과";
  ui.help.textContent=trial?"서버에서 이미 읽은 시험 문서만 브라우저에서 검색합니다. 별도 조회 없음.":"가상 데이터 8건 안에서만 검색합니다.";
  ui.feedLabel.textContent=trial?"ISOLATED FIRESTORE · MANUAL READ ONLY":"OFFLINE DEMO · ZERO CLOUD READS";
  ui.notice.textContent=trial?"시험 DB의 실제 운영 뉴스는 제공하지 않습니다. 미승인 사용자에게는 서버에서 조회를 거부합니다. 재노출·제목 변경 분류는 적용되지 않습니다.":"이 목록은 합성 데이터입니다. 실제 증권·언론 정보가 아닙니다.";
  ui.readSummary.textContent=trial?"조회 시도 "+attempt.count()+"회 · 브라우저 내 검색":"가상 뉴스 · 서버 조회 0회";
  ui.searchSummary.textContent=trial?"조건에 맞는 시험 문서 "+filtered.length+"건 / 내려받은 "+records.length+"건":"조건에 맞는 샘플 "+filtered.length+"건 / 전체 "+SAMPLE_NEWS.length+"건";
  ui.empty.hidden=filtered.length>0;
  if(trial&&trialRows.length===0&&trialReadState==="not_attempted"){
    ui.emptyTitle.textContent=signedIn?"위의 조회 버튼을 누르면 시험 뉴스가 표시됩니다.":"Google 계정으로 로그인한 뒤 조회하세요.";
    ui.emptyDescription.textContent="화면 전환과 검색만으로 Firestore를 자동 조회하지 않습니다.";
  }else{
    ui.emptyTitle.textContent="조건에 맞는 뉴스가 없습니다.";
    ui.emptyDescription.textContent=trial?"시험 문서가 없거나 검색 조건에 맞지 않습니다.":"검색어나 상태 필터를 변경하세요.";
  }
  const frag=document.createDocumentFragment();
  for(const item of filtered)frag.append(trial?makeTrialCard(item):makeDemoCard(item));
  ui.list.replaceChildren(frag);
}
function friendlyError(err){
  const code=String(err?.code||"");
  if(code==="permission-denied")return "서버가 읽기를 거부했습니다. 승인 정보와 로그인 UID가 일치하는지 확인하세요.";
  if(code==="failed-precondition")return "시험 Firestore 쿼리 인덱스 또는 설정을 확인하세요. 자동으로 만들지 않습니다.";
  if(code==="auth/popup-closed-by-user")return "로그인 창이 닫혔습니다.";
  if(code==="auth/unauthorized-domain")return "시험 Firebase 승인 도메인 설정을 확인하세요.";
  if(code==="auth/popup-blocked")return "브라우저에서 팝업 허용 여부를 확인하세요.";
  return "요청 실패("+safeDisplayText(code,60)+"). 자동 재시도하지 않습니다.";
}
async function initializeTrial(){
  const {trialConfig}=await import("../auth-trial/config.trial.mjs");
  if(validateTrialConfig(trialConfig,location.hostname)!=="READY_FOR_USER_APPROVED_TRIAL_ONLY"){
    ui.authInfo.textContent="시험 Firebase 안전 설정 검사 실패. 로그인과 조회는 차단했습니다.";
    setAuthBadge("안전 잠금","denied");
    return;
  }
  const [appMod,authMod,firestoreMod]=await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js")
  ]);
  const firebaseApp=appMod.initializeApp(trialConfig.firebase,"marketpasu-integrated-trial");
  firebaseAuth=authMod;
  firestore=firestoreMod;
  auth=authMod.getAuth(firebaseApp);
  db=firestoreMod.getFirestore(firebaseApp);
  await authMod.setPersistence(auth,authMod.browserSessionPersistence);
  firebaseReady=true;
  ui.authInfo.textContent="시험 Firebase 준비 완료 · 실제 운영 뉴스는 읽을 수 없습니다.";
  setAuthBadge(STATES.signedOut);
  refreshButtons();
  authMod.onAuthStateChanged(auth,user=>{
    const nextUid=user?.uid||"";
    const next=authTransition({previousUid:uid,nextUid,previousReadState:trialReadState});
    if(next.shouldClear)resetTrialData();
    uid=nextUid;
    signedIn=!!user;
    ui.uid.textContent=signedIn?uid:"로그인 후 표시";
    ui.copyUid.textContent="UID 복사";
    ui.accountState.textContent=next.account;
    setAuthBadge(next.label,next.verified?"approved":"");
    if(next.message)ui.feedback.textContent=next.message;
    ui.authInfo.textContent="시험 Firebase 준비 완료 · 운영 뉴스와 무관한 별도 인증입니다.";
    refreshButtons();
    render();
  },()=>{
    signedIn=false;uid="";
    resetTrialData();
    setAuthBadge("로그인 상태 오류","denied");
    ui.accountState.textContent="인증 상태 오류";
    ui.uid.textContent="로그인 후 표시";
    ui.copyUid.textContent="UID 복사";
    ui.feedback.textContent="인증 상태를 확인할 수 없습니다. 시험 뉴스는 화면에서 삭제됐습니다.";
    refreshButtons();render();
  });
}
ui.modeDemo.addEventListener("click",()=>setSource("demo"));
ui.modeTrial.addEventListener("click",()=>setSource("trial"));
for(const item of [ui.search,ui.searchMode,ui.statusFilter]){
  item.addEventListener(item===ui.search?"input":"change",render);
}
ui.reset.addEventListener("click",()=>{
  ui.search.value="";ui.searchMode.value="all";ui.statusFilter.value="all";render();
  ui.search.focus();
});
ui.copyUid.addEventListener("click",async()=>{
  if(!uid||!signedIn||busy)return;
  try{await navigator.clipboard.writeText(uid);ui.copyUid.textContent="UID 복사됨";}
  catch{ui.copyUid.textContent="UID를 선택하여 복사하세요";}
});
ui.login.addEventListener("click",async()=>{
  if(!auth||!firebaseReady||busy||signedIn)return;
  setBusy(true);
  try{
    const provider=new firebaseAuth.GoogleAuthProvider();
    provider.setCustomParameters({prompt:"select_account"});
    await firebaseAuth.signInWithPopup(auth,provider);
  }catch(err){ui.authInfo.textContent=friendlyError(err);}
  finally{setBusy(false);}
});
ui.logout.addEventListener("click",async()=>{
  if(!auth||busy||!signedIn)return;
  setBusy(true);
  try{await firebaseAuth.signOut(auth);}
  catch(err){ui.authInfo.textContent=friendlyError(err);}
  finally{setBusy(false);}
});
ui.fetch.addEventListener("click",async()=>{
  if(!db||!firestore||source!=="trial"||!signedIn||busy||!attempt.reserve())return;
  const accountUid=uid;
  setBusy(true);
  resetTrialData();
  trialReadState="in_progress";
  ui.feedback.textContent="시험 문서 최대 10건을 서버에서 한 번 조회 중입니다. 추가 조회는 잠깁니다.";
  render();
  try{
    const q=firestore.query(firestore.collection(db,TRIAL_COLLECTION),
      firestore.orderBy("collectedAt","desc"),firestore.limit(MAX_QUERY_DOCS));
    const snap=await firestore.getDocsFromServer(q);
    if(!signedIn||uid!==accountUid)return;
    const docs=snap.docs.map(d=>({id:d.id,data:d.data()}));
    trialRows=normalizedTrialRows(docs);
    trialReadState="success";
    ui.accountState.textContent="Google 로그인됨 · 시험 서버 읽기 권한 확인 완료";
    ui.authInfo.textContent="시험 Firebase 조회 정상 · 운영 Firebase와 분리되어 있습니다.";
    setAuthBadge(STATES.approved,"approved");
    ui.feedback.textContent="승인 회원 조회 성공 · 시험 문서 "+snap.size+"건. 추가 서버 조회는 잠겨 있습니다.";
  }catch(err){
    if(!signedIn||uid!==accountUid)return;
    trialReadState="failed";
    const isDenied=String(err?.code||"")==="permission-denied";
    ui.accountState.textContent=isDenied
      ?"Google 로그인됨 · 서버 읽기 거부(승인 UID 및 규칙 확인 필요)"
      :"Google 로그인됨 · 조회 실패로 승인 상태를 확인하지 못했습니다.";
    setAuthBadge(isDenied?STATES.denied:"조회 확인 실패","denied");
    ui.feedback.textContent=friendlyError(err)+" 이 페이지의 재시도는 잠겨 있습니다.";
  }finally{setBusy(false);render();}
});
refreshButtons();
render();
initializeTrial().catch(()=>{
  firebaseReady=false;db=null;auth=null;
  ui.authInfo.textContent="시험 Firebase 초기화 실패. 서버에 자동으로 재시도하지 않습니다.";
  setAuthBadge("연결 실패","denied");
  refreshButtons();
});
