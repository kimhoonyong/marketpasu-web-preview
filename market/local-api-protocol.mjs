/** Match browser and PC localhost chart API before attempting symbols/charts.
 * A healthy local credential vault says nothing about compatible routes.
 */
export const EXPECTED_PROTOCOL="marketpasu-local-v3";
const REQUIRED_ROUTES=["health","symbols","chart","diagnose"];
export function localApiCompatibility(info){
 if(!info||typeof info!=="object")return {compatible:false,reason:"UNRECOGNIZED_SERVICE"};
 if(info.protocol!==EXPECTED_PROTOCOL||info.protocolVersion!==3)
   return {compatible:false,reason:"OUTDATED_LOCAL_SERVER"};
 if(!Array.isArray(info.routes)||!REQUIRED_ROUTES.every(v=>info.routes.includes(v)))
   return {compatible:false,reason:"MISSING_API_ROUTES"};
 return {compatible:true,reason:"COMPATIBLE"};
}
export function localApiHelp(reason){
 switch(reason){
  case "OUTDATED_LOCAL_SERVER":
   return "집 PC의 127.0.0.1:8765 포트에서 구버전 마켓파수 연결기가 실행 중입니다. 검은색 기존 연결창을 모두 닫고 최신 연결기를 실행한 다음 새로고침하세요. API 키 재발급이나 인증파일 이동은 필요하지 않습니다.";
  case "MISSING_API_ROUTES":
   return "집 PC 로컬 연결기에서 종목 검색·차트·진단 경로 일부가 없습니다. 오래된 연결기를 종료하고 최신 연결기를 실행하세요.";
  default:
   return "127.0.0.1:8765에 예상한 마켓파수 조회 서비스가 없습니다. 사용 중인 프로그램과 포트를 확인하세요.";
 }
}
