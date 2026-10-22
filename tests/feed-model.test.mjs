import test from "node:test";
import assert from "node:assert/strict";
import {normalizedHeadline,matchesKeyword,uniqueArticles,visibleArticles} from "../market/feed-model.mjs";

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
