import {
  MAX_QUERY_DOCS, TRIAL_COLLECTION, validateTrialConfig,
  createSessionLimiter, safeDisplayText
} from "./trial-policy.mjs";

const byId = id => document.getElementById(id);
const els = {status:byId("status"),account:byId("account"),login:byId("login"),
  logout:byId("logout"),read:byId("read"),readStatus:byId("read-status"),
  records:byId("records"),uid:byId("uid"),copyUid:byId("copy-uid")};
const budget = createSessionLimiter();
let auth = null;
let db = null;
let signedIn = false;
let currentUid = "";
let working = false;

function status(text) { els.status.textContent = text; }
function readStatus(text) { els.readStatus.textContent = text; }
function refreshButtons() {
  els.login.disabled = !auth || working || signedIn;
  els.logout.disabled = !auth || working || !signedIn;
  els.read.disabled = !db || working || !signedIn || !budget.canRead();
  els.copyUid.disabled = !currentUid;
}
function setBusy(busy) { working = busy; refreshButtons(); }
function clearDocuments() { els.records.replaceChildren(); }
function appendDoc(id, data) {
  const li = document.createElement("li");
  const title = document.createElement("strong");
  const meta = document.createElement("small");
  // Untrusted Firestore content is always rendered as plain text.
  title.textContent = safeDisplayText(data.title || "(제목 없음)",180);
  meta.textContent = [
    safeDisplayText(data.publisher || "시험용 데이터",70),
    "시험 기록 "+safeDisplayText(id,80)
  ].join(" · ");
  li.append(title,meta);
  els.records.append(li);
}
function friendlyError(error) {
  const code = String(error?.code || "");
  if (code === "auth/popup-closed-by-user") return "사용자가 로그인 창을 닫았습니다.";
  if (code === "auth/unauthorized-domain") return "시험 Firebase의 승인된 도메인을 확인해야 합니다.";
  if (code === "permission-denied") return "Firestore 보안 규칙에서 조회를 거부했습니다. 시험 사용자 승인 여부를 확인하세요.";
  if (code === "failed-precondition") return "시험 Firestore 인덱스/설정 확인이 필요합니다. 자동 변경은 하지 않습니다.";
  return "요청이 실패했습니다. 시험 설정을 확인하세요. ("+safeDisplayText(code,60)+")";
}
async function initialize() {
  // config.local.mjs is deliberately untracked, absent in source.
  const local = await import("./config.trial.mjs").catch(() => null);
  const config = local?.trialConfig;
  const gate = validateTrialConfig(config,location.hostname);
  if (gate !== "READY_FOR_USER_APPROVED_TRIAL_ONLY") {
    status(gate+" — 시험 Firebase 미설정. 로그인·읽기를 실행하지 않습니다.");
    readStatus("안전 잠금: 승인된 독립 시험 환경을 구성해야 합니다.");
    return;
  }
  // Third-party SDK is not imported or called unless the isolated-project gate passes.
  const [firebaseApp,firebaseAuth,firestore] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js")
  ]);
  const app = firebaseApp.initializeApp(config.firebase);
  db = firestore.getFirestore(app);
  auth = firebaseAuth.getAuth(app);
  // browserSessionPersistence: no persistent login across full browser sessions.
  await firebaseAuth.setPersistence(auth,firebaseAuth.browserSessionPersistence);
  status("독립 시험 프로젝트 연결 준비 완료 · 운영 뉴스 읽기 불가");
  readStatus("시험 Google 로그인 후, 버튼을 눌러 최대 10건만 수동 조회할 수 있습니다.");

  firebaseAuth.onAuthStateChanged(auth,user=>{
    signedIn = !!user;
    currentUid = user?.uid || "";
    els.uid.textContent = currentUid || "로그인 후 표시됩니다.";
    clearDocuments();
    els.account.textContent = user ? "Google 로그인됨 · 승인된 시험 계정인지 Firestore 규칙에서 검증합니다." : "Google 계정 미연결";
    if (!user) readStatus("로그인해야 시험 뉴스를 조회할 수 있습니다.");
    refreshButtons();
  },()=>{signedIn=false;refreshButtons();status("로그인 세션 확인 오류 · 추가 조회 중단");});
  els.copyUid.addEventListener("click",async()=>{
    if (!currentUid) return;
    try { await navigator.clipboard.writeText(currentUid); els.copyUid.textContent = "UID 복사됨"; }
    catch { els.copyUid.textContent = "UID를 드래그해 복사하세요"; }
  });
  els.login.addEventListener("click",async()=>{
    if (!auth || working) return;
    setBusy(true);
    try {
      const provider = new firebaseAuth.GoogleAuthProvider();
      provider.setCustomParameters({prompt:"select_account"});
      await firebaseAuth.signInWithPopup(auth,provider);
    } catch(error) {
      status(friendlyError(error));
    } finally {setBusy(false);}
  });
  els.logout.addEventListener("click",async()=>{
    if (!auth || working) return;
    setBusy(true);
    try { await firebaseAuth.signOut(auth); }
    catch(error) {status(friendlyError(error));}
    finally {setBusy(false);}
  });
  els.read.addEventListener("click",async()=>{
    if (!db || !signedIn || working || !budget.reserve()) return;
    setBusy(true);
    clearDocuments();
    readStatus("최대 10건 단발성 Firestore 조회 중… 추가 조회는 잠금");
    try {
      const q=firestore.query(firestore.collection(db,TRIAL_COLLECTION),
        firestore.orderBy("collectedAt","desc"),firestore.limit(MAX_QUERY_DOCS));
      const snapshot=await firestore.getDocsFromServer(q);
      snapshot.forEach(doc=>appendDoc(doc.id,doc.data()));
      readStatus("시험 문서 "+snapshot.size+"건 조회 완료. 이번 페이지의 추가 조회는 잠겨 있습니다.");
    } catch(error) {
      readStatus(friendlyError(error)+" 재시도하려면 새로고침이 필요하며 비용이 발생할 수 있습니다.");
    } finally {setBusy(false);}
  });
  refreshButtons();
}
initialize().catch(()=>{status("시험 Firebase 초기화에 실패했습니다. 연결은 잠겼습니다.");auth=null;db=null;refreshButtons();});
