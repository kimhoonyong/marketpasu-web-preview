/**
 * Fictional data for an isolated visual prototype.
 * No real symbols, quotes, trading data or external source URLs.
 */
export const SAMPLE_NEWS=Object.freeze([
 {id:"D-001",stock:"가상기업 A",category:"반도체",title:"[가상] 반도체 공급 일정 관련 최초 보도",
  description:"최초 기사와 이후 재관측이 구분되는 화면을 시험하기 위한 가상 문장입니다.",
  status:"repeat",firstPublished:"2026-10-15",firstCollected:"2026-10-15",lastSeen:"2026-10-21",observations:4},
 {id:"D-002",stock:"가상기업 B",category:"자동차",title:"[가상] 신제품 발표 일정 기사 제목 변경 사례",
  description:"서로 유사한 뉴스 제목을 비교할 때 검토 상태가 어떻게 표시되는지 확인합니다.",
  status:"changed",firstPublished:"2026-10-17",firstCollected:"2026-10-17",lastSeen:"2026-10-20",observations:2},
 {id:"D-003",stock:"가상기업 C",category:"에너지",title:"[가상] 에너지 저장 연구 발표 검증 대기",
  description:"확인되지 않은 주장에는 확정적인 투자 판단을 붙이지 않는 예시입니다.",
  status:"review",firstPublished:"2026-10-19",firstCollected:"2026-10-19",lastSeen:"2026-10-21",observations:1},
 {id:"D-004",stock:"가상기업 D",category:"바이오",title:"[가상] 연구개발 일정 공지",
  description:"반복 보도나 제목 변경을 발견하지 않은 일반 기사 형식 예시입니다.",
  status:"normal",firstPublished:"2026-10-20",firstCollected:"2026-10-20",lastSeen:"2026-10-20",observations:1},
 {id:"D-005",stock:"가상기업 E",category:"소프트웨어",title:"[가상] 소프트웨어 부문 사업 발표 반복 노출",
  description:"며칠이 지난 과거 기사가 다시 관측되는 경우를 나타냅니다.",
  status:"repeat",firstPublished:"2026-10-13",firstCollected:"2026-10-13",lastSeen:"2026-10-21",observations:5},
 {id:"D-006",stock:"가상기업 F",category:"로봇",title:"[가상] 로봇 서비스 출시 예상 문구 수정",
  description:"기사 표현 변화의 추적이 필요할 때 표시되는 검토 예시입니다.",
  status:"changed",firstPublished:"2026-10-16",firstCollected:"2026-10-16",lastSeen:"2026-10-19",observations:3},
 {id:"D-007",stock:"가상기업 G",category:"건설",title:"[가상] 사업 일정 관련 자료 대조 필요",
  description:"일정과 수치의 신뢰성을 별도 확인해야 하는 유형입니다.",
  status:"review",firstPublished:"2026-10-18",firstCollected:"2026-10-19",lastSeen:"2026-10-20",observations:1},
 {id:"D-008",stock:"가상기업 H",category:"소비재",title:"[가상] 소비재 신규 라인업 공개",
  description:"일반 샘플 기사로, 임의의 실적 수치나 주가 정보는 포함하지 않습니다.",
  status:"normal",firstPublished:"2026-10-21",firstCollected:"2026-10-21",lastSeen:"2026-10-21",observations:1},
]);
export const LABELS=Object.freeze({review:"검토 필요",changed:"제목 변경 의심",repeat:"재노출 검토",normal:"일반"});
export function filterNews(records,{text="",mode="all",status="all"}={}){
  const term=String(text).trim().normalize("NFC").toLocaleLowerCase("ko-KR");
  const candidates=records.filter(r=>{
    const matches=status==="all"||r.status===status;
    const subject=mode==="stock"?r.stock:mode==="news"?r.title:[r.stock,r.category,r.title,r.description].join(" ");
    return matches&&(!term||subject.normalize("NFC").toLocaleLowerCase("ko-KR").includes(term));
  });
  return candidates;
}
export function counts(records){
  return {total:records.length,review:records.filter(r=>r.status==="review").length,
    changed:records.filter(r=>r.status==="changed").length,
    repeat:records.filter(r=>r.status==="repeat").length};
}
