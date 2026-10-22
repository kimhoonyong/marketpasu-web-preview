import test from "node:test";
import assert from "node:assert/strict";
import {projectCandidate, projectCandidates, MAX_DISPLAY_ROWS} from "./news-contract.mjs";

const base = {
  title:"[가상] 신규 사업 소식",
  source:"가상 언론사",
  publishedAt:"2026-10-21T09:00:00+09:00",
  seenCount:1,
  firstSeenAt:{seconds:1792569600},
  lastSeenAt:{seconds:1792656000}
};

test("minimal allowlist excludes internal and operational fields",()=>{
  const item=projectCandidate("abc",{
    ...base,rssUrl:"https://news.google.com/rss/internal",
    publisherUrl:"https://example.com/private",
    aiSummary:"secret",billingDocPath:"private",publisherMissingTotal:3
  });
  assert.equal(item.title,base.title);
  assert.equal(item.publisher,base.source);
  assert.deepEqual(Object.keys(item).sort(),[
    "id","title","publisher","firstPublished","firstCollected",
    "lastSeen","observations","status","statusLabel"
  ].sort());
  assert.equal(JSON.stringify(item).includes("private"),false);
  assert.equal(Object.isFrozen(item),true);
});
test("mere absence never becomes confirmed deletion",()=>{
  const item=projectCandidate("a",{
    ...base,publisherMissingCount:2,publisherReviewRequired:true,
    publisherCheckStatus:"possible_removal_review"
  });
  assert.equal(item.status,"review");
  assert.match(item.statusLabel,/삭제 확정 아님/);
});
test("suspected publisher title change wins over repeat",()=>{
  const item=projectCandidate("a",{
    ...base,seenCount:4,publisherTitleChangeCount:1,
    publisherReviewRequired:true,publisherCheckStatus:"title_change_review"
  });
  assert.equal(item.status,"changed");
  assert.match(item.statusLabel,/의심/);
});
test("second observation is reviewable repeat, not confirmed manipulation",()=>{
  const item=projectCandidate("a",{...base,seenCount:2});
  assert.equal(item.status,"repeat");
  assert.match(item.statusLabel,/검토/);
});
test("bad input and invalid counters are rejected or safely bounded",()=>{
  assert.equal(projectCandidate("x",{title:""}),null);
  assert.equal(projectCandidate("x",null),null);
  const item=projectCandidate("x",{...base,seenCount:-5});
  assert.equal(item.observations,0);
  const rows=Array.from({length:20},(_,i)=>({id:String(i),data:base}));
  assert.equal(projectCandidates(rows).length,MAX_DISPLAY_ROWS);
  assert.equal(projectCandidates(rows,11).length,0);
});
test("timestamp objects and invalid dates are safe to display",()=>{
  assert.ok(projectCandidate("a",base).lastSeen.endsWith("Z"));
  assert.equal(projectCandidate("a",{...base,publishedAt:"invalid"}).firstPublished,"");
});
