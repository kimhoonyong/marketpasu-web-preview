/**
 * Joint presentation of daily multiweek chart clues and 1-minute market clues.
 * Does not assert manipulation, foreknowledge, or any participant's ownership.
 * A late Google News RSS timestamp never becomes verified original publication.
 */
const disclaimer="같은 종목의 장기 가격대 지지와 단기 체결 압력이 관측되어도 특정 세력의 매집·물량 출회·호재 사전 인지로 확정할 수 없습니다.";
const signalsOf=x=>new Set((Array.isArray(x?.signals)?x.signals:[]).map(s=>s.code));
export function assessDualHorizon({daily,minute,sameNews=false,sameStock=false}={}){
 const summary={status:"WAITING_FOR_BOTH_WINDOWS",summary:"일봉과 분봉을 각각 분석한 뒤 함께 비교할 수 있습니다.",
  observations:[],notes:[],disclaimer};
 if(!sameNews||!sameStock){
   summary.status="SOURCE_MATCH_UNVERIFIED";
   summary.summary="뉴스·종목이 일치하는 분석 결과인지 확인해야 합니다.";
   return summary;
 }
 if(!daily||!minute){
   summary.notes.push("양쪽 분석이 모두 있어야 장·단기 관측을 함께 비교할 수 있습니다.");
   return summary;
 }
 if(daily.status==="NOT_ASSESSABLE"||minute.status==="NOT_ASSESSABLE"){
   summary.status="INCOMPLETE_EVIDENCE";
   summary.summary="일봉 또는 분봉의 필수 데이터가 부족하여 통합 비교를 보류합니다.";
   return summary;
 }
 const d=signalsOf(daily),m=signalsOf(minute);
 const daySupport=d.has("MULTIWEEK_REPEAT_SUPPORT");
 const dayLiquidity=d.has("RECENT_DAILY_TURNOVER_EXPANSION")||d.has("RECENT_DAILY_VOLUME_EXPANSION");
 const minuteAbsorb=m.has("PRE_NEWS_ABSORPTION_LIKE");
 const minuteRunup=m.has("PRE_NEWS_RUNUP_AND_RETRACE");
 const minuteSell=m.has("POST_NEWS_SELL_PRESSURE");
 const minuteBuy=m.has("POST_NEWS_BUY_FOLLOW_THROUGH");
 if(daySupport)summary.observations.push("장기 일봉: 과거 가격대에 반복적으로 접근한 뒤 반등");
 if(dayLiquidity)summary.observations.push("장기 일봉: 이전 기간 대비 거래량 또는 거래대금 증가");
 if(minuteAbsorb)summary.observations.push("단기 분봉: 거래대금 증가와 매수 주도 체결·가격 지지 동반");
 if(minuteRunup)summary.observations.push("단기 분봉: 기준보다 상승한 뒤 뉴스 표기시각 이전 고점에서 후퇴");
 if(minuteSell)summary.observations.push("단기 분봉: 뉴스 표기시각 이후 가격 하락과 매도 주도 체결 우위");
 if(minuteBuy)summary.observations.push("단기 분봉: 뉴스 표기시각 이후 가격 지지와 매수 주도 체결 우위");
 const validatedPrices=daily.status!=="ADJUSTMENT_CHECK_REQUIRED";
 if(!validatedPrices){
  summary.status="DAILY_ADJUSTMENT_UNVERIFIED";
  summary.summary="장기 가격 연속성 미확인 — 패턴 표시만 가능하며 함께 해석하지 않습니다.";
  return summary;
 }
 const verifiedNews=daily.status!=="NEWS_ORIGIN_UNVERIFIED"&&minute.status!=="FIRST_PUBLICATION_UNVERIFIED";
 // Even if the combined observations are striking, RSS origin is not verified:
 // never label as "before original news" or as a proven distribution.
 if(!verifiedNews){
   summary.status="ORIGINAL_NEWS_TIME_UNVERIFIED";
   summary.summary=daySupport&&(minuteSell||minuteRunup)
     ?"장기 가격대 지지와 단기 급등·매도 압력 신호가 함께 관측됨 — 최초 보도시각 미확인"
     :daySupport&&minuteAbsorb
       ?"장기 지지와 단기 매수 집중 신호가 함께 관측됨 — 최초 보도시각 미확인"
       :"일봉·분봉 동시 관측 — 최초 보도시각을 검증하기 전 판단 보류";
   summary.notes.push("Google 뉴스 RSS의 게시시각은 최초 원문 보도시각과 같다고 볼 수 없습니다.");
   return summary;
 }
 if(daySupport&&minuteSell){
  summary.status="LONG_SUPPORT_AND_POST_NEWS_SELLING";
  summary.summary="장기 반복 지지 뒤 뉴스 이후 매도 주도 체결 우위 관측 — 위험 신호 검토";
 }else if(daySupport&&minuteAbsorb){
  summary.status="LONG_SUPPORT_AND_SHORTTERM_BUYING";
  summary.summary="장기 반복 지지와 뉴스 직전 단기 매수 주도 체결 동반 관측";
 }else{
  summary.status="NO_JOINT_PATTERN";
  summary.summary="장·단기에서 동시에 나타나는 주요 패턴이 제한적입니다.";
 }
 summary.notes.push("조건 불충족은 안전 판정이 아니며 주식 매매 추천이 아닙니다.");
 return summary;
}
