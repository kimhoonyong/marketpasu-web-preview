/**
 * Only fixed non-sensitive auth status codes from local /health are used.
 * This does not read or display APP KEY, SECRET, token, account, or vault.
 */
export function localAuthExplanation(ready, code){
 if(ready===true)return {
   state:"ready",heading:"PC 키움 인증 연결 확인",
   guide:"기존 REST 인증을 로컬에서 읽었습니다. 실제 키움 시세 응답은 종목 검색으로 확인하세요."
 };
 const descriptions={
   EXISTING_MODULE_NOT_FOUND:["기존 인증 모듈 경로 불일치",
     "D:\\ThemeManager\\secure_credentials.py 파일이 현재 PC에 있는지 확인하세요. 실제 ThemeManager 설치 위치가 다르면 연결기 실행 시 MARKETPASU_THEME_ROOT 설정을 확인해야 합니다."],
   EXISTING_VAULT_NOT_FOUND:["기존 암호화 인증파일을 찾지 못함",
     "D:\\ThemeManager\\data\\kiwoom_rest_credentials.bin 파일 유무를 확인하세요. 파일을 새로 만들거나 복사하지 말고 기존 ThemeManager에서 인증 상태를 점검하세요."],
   EXISTING_AUTH_LOAD_FAILED:["기존 인증 모듈 실행·복호화 실패",
     "ThemeManager를 인증파일을 만든 동일 Windows 사용자로 실행했는지 확인하세요. Python 의존성 또는 기존 Windows 사용자별 암호화 접근 문제일 수 있습니다. 키·토큰을 채팅에 올리지 마세요."],
   EXISTING_AUTH_FORMAT_UNSUPPORTED:["기존 인증 모듈 반환 형식 불일치",
     "기존 ThemeManager 모듈이 반환하는 인증 형식이 연결기에서 인식되지 않았습니다. 실제 키·토큰을 보내지 말고 진단 상태코드만 확인하세요."],
   NOT_CHECKED:["인증상태 확인 중","PC 연결기의 인증상태 재확인 버튼을 눌러 주세요."],
 };
 const [heading,guide]=descriptions[String(code||"")]||[
   "PC 키움 인증정보 연결 안 됨",
   "기존 D:\\ThemeManager 인증 환경, 실행 중인 Windows 사용자 및 검은색 로컬 연결창의 KIWOOM_AUTH_SOURCE_STATUS를 확인하세요."
 ];
 return {state:"not-ready",heading,guide};
}
