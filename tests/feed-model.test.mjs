import test from "node:test";
import assert from "node:assert/strict";
import {normalizedHeadline,matchesKeyword,uniqueArticles,visibleArticles,groupRelatedReports} from "../market/feed-model.mjs";

const row=(over={})=>({id:"one",title:"삼성전자 실적 개선",publisher:"연합뉴스",url:"https://news.google.com/a",topic:"삼성전자",...over});
test("normalize whitespace and casing, not economically different headlines",()=>{
  assert.equal(normalizedHeadline("  삼성전자    실적  "),normalizedHeadline("삼성전자 실적"));
  assert.notEqual(normalizedHeadline("주가 10% 상승"),normalizedHeadline("주가 1% 상승"));
});
test("merge only duplicate URL or title and publisher, retaining multiple topics",()=>{
  const grouped=uniqueArticles([
    row(),row({id:"two",url:"https://news.google.com/b",topic:"코스피"}),
    row({id:"three",publisher:"다른신문",url:"https://news.google.com/c"}),
    row({id:"four",title:"삼성전자 실적 악화",url:"https://news.google.com/d"})
  ]);
  assert.equal(grouped.length,3);
  assert.equal(grouped[0].grouped,2);
  assert.deepEqual(grouped[0].topics,["삼성전자","코스피"]);
});
test("different publishers with the same text are not misclassified",()=>{
  assert.equal(uniqueArticles([row(),row({id:"two",url:"https://news.google.com/b",publisher:"타매체"})]).length,2);
});
test("interest keywords search every topic in a merged article",()=>{
  const a=uniqueArticles([row(),row({id:"two",url:"https://news.google.com/b",topic:"코스피"})]);
  assert.equal(matchesKeyword(a[0],"코스피"),true);
  assert.equal(visibleArticles(a,{filter:"watch",watchKeywords:["코스피"]}).length,1);
});
test("focus one stock, no matches is correctly empty",()=>{
  assert.equal(visibleArticles([row()],{filter:"watch",focus:"명신산업"}).length,0);
});
test("unread filtering and search are independent, no authorization implied",()=>{
  const a=[row(),row({id:"two",title:"테슬라 3분기",topic:"테슬라"})];
  assert.deepEqual(visibleArticles(a,{filter:"unread",readIds:new Set(["one"])}).map(x=>x.id),["two"]);
  assert.equal(visibleArticles(a,{filter:"unread",search:"삼성전자",readIds:new Set(["one"])}).length,0);
});

const news=(title,publisher,stamp="2026-10-22T08:00:00Z",over={})=>({
  id:publisher+title,url:"https://news.google.com/rss/"+encodeURIComponent(publisher+title),
  title,publisher,topic:"LG전자",published:stamp,...over
});
test("four similar LG power plant reports collapse into one expandable group",()=>{
  const articles=[
    news("LG전자, 수자원공사와 시화호 AI 조력발전소 추진","동아일보"),
    news("LG전자, 수자원공사와 세계 최대 조력발전소 AI 전환 추진","뉴스토마토"),
    news("LG전자, 수자원공사와 시화호 조력발전소 AI 전환","전자신문")
  ];
  const grouped=groupRelatedReports(articles);
  assert.equal(grouped.length,1);
  assert.equal(grouped[0].length,3);
  assert.equal(new Set(grouped[0].map(x=>x.publisher)).size,3);
});
test("same ticker on different unrelated events stays separate",()=>{
  const grouped=groupRelatedReports([
    news("LG전자, 세계 최대 조력발전소 AI 전환 추진","뉴스A"),
    news("LG전자, 3분기 영업이익 전년 대비 40% 증가","뉴스B")
  ]);
  assert.equal(grouped.length,2);
});
test("different numerical claims are not blindly collapsed",()=>{
  const grouped=groupRelatedReports([
    news("코스피 3.52% 하락 마감","뉴스A",undefined,{topic:"코스피"}),
    news("코스피 2.11% 상승 마감","뉴스B",undefined,{topic:"코스피"})
  ]);
  assert.equal(grouped.length,2);
});
test("same news outside the bounded day window stays separate",()=>{
  const grouped=groupRelatedReports([
    news("현대차·기아, 유럽 판매량 3.4% 감소","뉴스A","2026-10-22T08:00:00Z",{topic:"현대차"}),
    news("현대차·기아, 유럽 판매량 3.4% 감소","뉴스B","2026-10-19T08:00:00Z",{topic:"현대차"})
  ]);
  assert.equal(grouped.length,2);
});
test("unread and searched result grouping does not remove any source link",()=>{
  const rows=[
    news("LG전자, 수자원공사와 세계 최대 조력발전소 AI 전환 추진","뉴스A"),
    news("LG전자, 수자원공사와 시화호 조력발전소 AI 전환","뉴스B"),
    news("테슬라, 신차 공개","뉴스C",undefined,{topic:"테슬라"})
  ];
  const onlyLG=visibleArticles(rows,{search:"LG전자"});
  const groups=groupRelatedReports(onlyLG);
  assert.equal(groups.reduce((n,g)=>n+g.length,0),2);
  assert.equal(groups.length,1);
});
