import test from "node:test";
import assert from "node:assert/strict";
import {marketRelevant,marketRelevanceScore,focusedMarketStories,highConfidenceEventKey} from "../market/news-quality.mjs";
import {groupRelatedReports} from "../market/feed-model.mjs";
const sample=(title,publisher="뉴스",published="2026-10-24T00:00:00Z",topic="시장")=>({
 id:title,topic,publisher,title,published,url:"https://news.google.com/rss/"+encodeURIComponent(title)
});
test("Naver Blog unrelated posts never become NAVER stock news via RSS topic",()=>{
 assert.equal(marketRelevant(sample("유아교육진흥원 가족체험 : 네이버 블로그","Naver Blog",undefined,"NAVER")),false);
 assert.equal(marketRelevant(sample("삼성E&A 사업 성장 : 네이버 블로그","Naver Blog",undefined,"NAVER")),false);
});
test("exclude consumer, school and unrelated lifestyle reports",()=>{
 for(const t of ["[시승기] 현대차 SUV 투싼","삼성전자 이건희 추도식","LG전자 한국PR대상","테슬라 모델Y 시승기"]){
  assert.equal(marketRelevant(sample(t)),false,t);
 }
});
test("tracked listed companies plus material market event are eligible",()=>{
 for(const t of ["삼성전자 영업이익 20% 증가","명신산업 테슬라 공급 계약 확대",
   "SK하이닉스 솔리다임 IPO 철회","테슬라 차량 출하량 감소",
   "엔비디아 AI 반도체 투자 확대","현대차 전기차 판매량 증가"]){
  assert.equal(marketRelevant(sample(t)),true,t);
 }
});
test("market-impact macro indicators are allowed without specific issuer",()=>{
 for(const t of ["코스피 2% 급락, 외국인 매도","원/달러 환율 급등",
  "국내 증시 낙폭 회복 마감","코스닥 지수 1% 하락"]){
  assert.equal(marketRelevant(sample(t)),true,t);
 }
});
test("ignore one-off microcap reports unless subject truly tracked",()=>{
 assert.equal(marketRelevant(sample("[특징주] 디티에스, 코스닥 상장 첫날 35% 강세 마감")),false);
 assert.equal(marketRelevant(sample("코스닥 입성 3년 만에 퇴출, 바이오주")),false);
});
test("feed discovery topic alone cannot imply issuer identity",()=>{
 assert.equal(marketRelevant(sample("솔리다임 상장설로 SK하이닉스 주가 상승","뉴스",undefined,"명신산업")),true);
 assert.equal(marketRelevant(sample("초등학생 AI 체험 캠프","뉴스",undefined,"명신산업")),false);
});
test("priority reflects tracked issuer event and is not an investment score",()=>{
 const issuer=sample("SK하이닉스 영업이익 개선");
 const macro=sample("코스피 지수 하락 마감");
 assert.ok(marketRelevanceScore(issuer)>marketRelevanceScore(macro));
 assert.equal(marketRelevanceScore(sample("네이버 블로그 무료 교육")),-1);
});
test("same Solidigm IPO withdrawal story with changed editorial angles becomes one group",()=>{
 const names=[
  "솔리다임 상장 '전격 철회'…SK하이닉스 주가 반등 신호탄",
  "솔리다임 IPO 접은 SK하이닉스…자본배분 셈법 복잡",
  "SK하이닉스 ADR, 솔리다임 美 IPO 철회 소식에 4% 급등",
  "SK하이닉스, 손자회사 솔리다임 美 상장 접어",
  "SK하이닉스, 솔리다임 IPO 검토 중단…주주가치 기대"
 ];
 const rows=names.map((t,i)=>sample(t,"언론사"+i));
 assert.ok(rows.every(x=>highConfidenceEventKey(x)));
 const grouped=groupRelatedReports(rows);
 assert.equal(grouped.length,1);
 assert.equal(grouped[0].length,5);
 assert.equal(new Set(grouped[0].map(x=>x.url)).size,5);
});
test("separate IPO listing or other events should not be merged with withdrawal",()=>{
 assert.equal(highConfidenceEventKey(sample("솔리다임 IPO 상장 추진")),"");
 const rows=[sample("솔리다임 IPO 상장 추진"),sample("솔리다임 IPO 철회")];
 assert.equal(groupRelatedReports(rows).length,2);
});
test("reports about opposing financial results stay separate",()=>{
 const rows=[sample("SK하이닉스 영업이익 10% 증가"),sample("SK하이닉스 영업이익 30% 감소")];
 assert.equal(groupRelatedReports(rows).length,2);
});
test("outdated withdrawal story not merged with a new dated event",()=>{
 const one=sample("SK하이닉스 솔리다임 IPO 철회","신문1","2026-10-22T00:00:00Z");
 const two=sample("SK하이닉스 솔리다임 상장 중단","신문2","2026-10-24T18:00:00Z");
 assert.equal(groupRelatedReports([one,two]).length,2);
});
test("focus filter preserves all source links for expanding related story",()=>{
 const rows=[sample("SK하이닉스 솔리다임 IPO 철회"),sample("솔리다임 상장 접어")];
 assert.equal(focusedMarketStories(rows).length,2);
});
