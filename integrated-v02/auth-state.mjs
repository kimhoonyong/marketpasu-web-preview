/**
 * Pure, offline authentication UI transitions for the integrated trial.
 * Never fetches user profiles, Firestore data, tokens, or production resources.
 * Approval is confirmed only after an actual bounded Firestore query succeeds.
 */
export function authTransition({previousUid="",nextUid="",previousReadState="not_attempted"}={}){
  const changed=previousUid!==nextUid;
  if(!nextUid){
    return Object.freeze({
      label:"로그아웃",
      account:"Google 계정 미연결",
      message:previousUid
        ?"로그아웃 완료 · UID와 시험 뉴스가 화면에서 삭제됐습니다."
        :"로그인 전입니다. Google 계정으로 로그인하면 시험 뉴스를 조회할 수 있습니다.",
      shouldClear:changed,
      verified:false
    });
  }
  const verified=!changed&&previousReadState==="success";
  return Object.freeze({
    label:verified?"조회 허용 확인":"승인 확인 전",
    account:verified
      ?"Google 로그인됨 · 시험 서버 읽기 권한 확인 완료"
      :"Google 로그인됨 · Firestore 조회 전이므로 승인 여부는 확인되지 않았습니다.",
    message:changed
      ?"Google 로그인 성공 · 서버 승인 여부는 아직 미확인입니다. 아래에서 시험 뉴스를 수동 조회하세요."
      :null,
    shouldClear:changed,
    verified
  });
}
