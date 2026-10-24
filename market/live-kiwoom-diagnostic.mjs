/**
 * Only public-safe, fixed stage/reason codes; never interpolate arbitrary
 * broker messages, token fragments, credentials or response bodies.
 */
export function explainLiveKiwoom(state,stage,reason){
 const labels={OAUTH:"접근토큰 단계",STOCK_LIST:"종목목록(ka10099) 단계",CHART:"차트 시세 단계"};
 const safeStage=Object.prototype.hasOwnProperty.call(labels,stage)?stage:null;
 if(state==="OK"&&stage==="STOCK_LIST"&&reason==="VERIFIED_READ_ONLY")
   return {ok:true,text:"실제 키움 서버의 코스피 종목목록 조회 성공 — 토큰과 ka10099 통신이 확인됐습니다."};
 const messages={
   HTTP_401:"인증 거부(HTTP 401): 기존 토큰 만료나 유효성 문제 가능성. ThemeManager REST 인증 갱신 상태를 확인하세요.",
   HTTP_403:"접근 제한(HTTP 403): 키움 REST 사용 권한·IP 등록·API 서비스 설정을 확인하세요.",
   HTTP_429:"조회 제한(HTTP 429): 요청이 너무 많습니다. 반복 조회를 멈추고 키움 API 호출 제한을 확인하세요.",
   HTTP_5XX:"키움 서버 오류(HTTP 5xx): 키움 서비스 상태를 확인하세요.",
   HTTP_OTHER:"키움 HTTP 응답 오류: 네트워크와 REST 서비스 설정을 확인하세요.",
   NETWORK_OR_TIMEOUT:"키움 연결 실패/시간 초과: 집 PC 인터넷·보안 프로그램·키움 서버 연결을 확인하세요.",
   INVALID_JSON:"키움 응답 형식 오류: REST 응답이 JSON이 아닙니다.",
   PROVIDER_REJECTED:"키움 REST가 요청을 거부했습니다. 키움 앱 권한·IP·토큰·시장 설정을 점검하세요.",
   UNEXPECTED_RESPONSE:"키움 응답을 인식하지 못했습니다. 연결기와 API 응답 형식의 호환성 점검이 필요합니다.",
   MISSING_CREDENTIALS:"기존 REST 인증정보 연결 실패: ThemeManager 로컬 인증 상태를 다시 확인하세요."
 };
 const safeReason=Object.prototype.hasOwnProperty.call(messages,reason)?reason:"UNEXPECTED_RESPONSE";
 return {ok:false,text:(labels[safeStage]||"키움 API 단계")+" · "+messages[safeReason],
   stage:safeStage||"UNKNOWN",reason:safeReason};
}
