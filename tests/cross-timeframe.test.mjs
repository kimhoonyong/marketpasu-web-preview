import test from "node:test";
import assert from "node:assert/strict";
import {assessDualHorizon} from "../market/cross-timeframe.mjs";

const daily=(status="NEWS_ORIGIN_UNVERIFIED",codes=["MULTIWEEK_REPEAT_SUPPORT","RECENT_DAILY_TURNOVER_EXPANSION"])=>({
 status,signals:codes.map(code=>({code}))
});
const minute=(status="FIRST_PUBLICATION_UNVERIFIED",codes=["PRE_NEWS_RUNUP_AND_RETRACE","POST_NEWS_SELL_PRESSURE"])=>({
 status,signals:codes.map(code=>({code}))
});
const match={sameNews:true,sameStock:true};
test("never cross articles or stock codes",()=>{
 assert.equal(assessDualHorizon({daily:daily(),minute:minute(),sameNews:false,sameStock:true}).status,"SOURCE_MATCH_UNVERIFIED");
 assert.equal(assessDualHorizon({daily:daily(),minute:minute(),sameNews:true,sameStock:false}).status,"SOURCE_MATCH_UNVERIFIED");
});
test("missing one timeframe remains unassessed",()=>{
 assert.equal(assessDualHorizon({...match,daily:daily()}).status,"WAITING_FOR_BOTH_WINDOWS");
});
test("missing underlying day or minute data blocks joint analysis",()=>{
 assert.equal(assessDualHorizon({...match,daily:daily("NOT_ASSESSABLE"),minute:minute()}).status,"INCOMPLETE_EVIDENCE");
 assert.equal(assessDualHorizon({...match,daily:daily(),minute:minute("NOT_ASSESSABLE")}).status,"INCOMPLETE_EVIDENCE");
});
test("unknown adjusted daily price continuity blocks joint interpretation",()=>{
 const a=assessDualHorizon({...match,daily:daily("ADJUSTMENT_CHECK_REQUIRED"),minute:minute()});
 assert.equal(a.status,"DAILY_ADJUSTMENT_UNVERIFIED");
 assert.ok(a.observations.length>0);
});
test("RSS first-publication time uncertainty blocks distribution verdict",()=>{
 const a=assessDualHorizon({...match,daily:daily(),minute:minute()});
 assert.equal(a.status,"ORIGINAL_NEWS_TIME_UNVERIFIED");
 assert.match(a.summary,/최초 보도시각 미확인/);
 assert.ok(a.observations.some(s=>s.includes("장기")));
 assert.ok(a.observations.some(s=>s.includes("단기")));
 assert.match(a.disclaimer,/확정할 수 없습니다/);
});
test("two verified timeframes may raise review flag, never accuse a party",()=>{
 const a=assessDualHorizon({...match,
   daily:daily("REPEATED_SUPPORT_OBSERVED"),
   minute:minute("POST_NEWS_DISTRIBUTION_WATCH")
 });
 assert.equal(a.status,"LONG_SUPPORT_AND_POST_NEWS_SELLING");
 assert.match(a.summary,/검토/);
});
test("long support plus buy-initiated prints remains observation only",()=>{
 const a=assessDualHorizon({...match,daily:daily("REPEATED_SUPPORT_OBSERVED"),
 minute:minute("ACCUMULATION_LIKE_CLUES",["PRE_NEWS_ABSORPTION_LIKE"])});
 assert.equal(a.status,"LONG_SUPPORT_AND_SHORTTERM_BUYING");
 assert.match(a.disclaimer,/입증|확정/);
});
test("no joint signal is not a declaration of safety",()=>{
 const a=assessDualHorizon({...match,daily:daily("NO_REPEATED_SUPPORT_DETECTED",[]),
 minute:minute("NO_CLEAR_EVIDENCE",[])});
 assert.equal(a.status,"NO_JOINT_PATTERN");
 assert.ok(a.notes.some(t=>t.includes("안전 판정이 아니")));
});
