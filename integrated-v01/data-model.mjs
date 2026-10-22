import {SAMPLE_NEWS, filterNews, counts} from "../demo-data.mjs";
import {MAX_QUERY_DOCS,safeDisplayText} from "../auth-trial/trial-policy.mjs";

export {SAMPLE_NEWS};
export const DATA_SOURCES=Object.freeze(["demo","trial"]);
export const STATES=Object.freeze({signedOut:"로그아웃",unverified:"승인 확인 전",approved:"조회 허용 확인",denied:"읽기 거부"});
export function normalizedTrialRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0,MAX_QUERY_DOCS).map(item=>{
    const data = item && typeof item.data === "object" && item.data !== null ? item.data : {};
    return Object.freeze({
      id:safeDisplayText(item?.id,90),title:safeDisplayText(data.title,180)||"(제목 없음)",
      publisher:safeDisplayText(data.publisher,100)||"시험 뉴스",
      collectedAt:safeDisplayText(data.collectedAt,60)||"기록 없음",
      source:"trial"
    });
  });
}
export function filterIntegrated(records, options={}) {
  const source=options.source==="trial"?"trial":"demo";
  if(source==="demo")return filterNews(records,{
    text:options.text||"",mode:options.mode||"all",status:options.status||"all"
  });
  const text=String(options.text||"").trim().normalize("NFC").toLocaleLowerCase("ko-KR");
  const mode=options.mode||"all";
  return records.filter(item=>{
    const values=mode==="news"?[item.title]:mode==="stock"?[item.publisher]:[item.title,item.publisher];
    return !text||values.some(v=>String(v||"").normalize("NFC").toLocaleLowerCase("ko-KR").includes(text));
  });
}
export function demoMetrics(records){return counts(records);}
export function trialMetrics(records){return {total:records.length,review:null,changed:null,repeat:null};}
