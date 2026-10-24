import {highConfidenceEventKey} from "./news-quality.mjs";
// Pure UI helpers. This file does not call a server or touch browser storage.
export function normalizedHeadline(value) {
  return String(value ?? "").normalize("NFKC").trim()
    .replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}
export function matchesKeyword(item, keyword) {
  const needle=normalizedHeadline(keyword);
  if(!needle)return false;
  const haystack=[item.title,item.publisher,item.topic,...(Array.isArray(item.topics)?item.topics:[])];
  return haystack.some(value=>normalizedHeadline(value).includes(needle));
}
// Never equate different publisher perspectives merely because they have similar headlines.
// Only the exact same URL or the same normalized title + publisher is consolidated.
export function uniqueArticles(rows) {
  const kept=[], byUrl=new Map(), byHeadline=new Map();
  for(const item of rows){
    const url=String(item.url||"");
    const key=normalizedHeadline(item.title)+"\u001f"+normalizedHeadline(item.publisher);
    let entry=byUrl.get(url)||byHeadline.get(key);
    if(!entry){
      entry={...item,topics:[...new Set([...(item.topics||[]),item.topic].filter(Boolean))],grouped:1};
      kept.push(entry);
    } else {
      entry.grouped++;
      for(const topic of [item.topic,...(item.topics||[])]) {
        if(topic && !entry.topics.includes(topic))entry.topics.push(topic);
      }
    }
    if(url)byUrl.set(url,entry);
    byHeadline.set(key,entry);
  }
  return kept;
}
export function visibleArticles(rows,{filter="all",search="",watchKeywords=[],focus="",readIds=new Set()}={}){
  const term=normalizedHeadline(search);
  return rows.filter(item=>{
    if(term && !matchesKeyword(item,term))return false;
    if(filter==="unread")return !readIds.has(item.id);
    if(filter!=="watch")return true;
    if(focus)return matchesKeyword(item,focus);
    return watchKeywords.some(word=>matchesKeyword(item,word));
  });
}

/**
 * Group probable coverage of the same event for presentation only.
 * Every source article remains accessible. This is not verification that
 * publishers copied one another or that an article was reposted.
 */
function compactTitle(value) {
  return normalizedHeadline(value)
    .replace(/\[[^\]]{1,20}\]/g," ")
    .replace(/[^가-힣a-z0-9]/g,"");
}
function trigrams(value) {
  const result=new Set();
  for(let i=0;i<=value.length-3;i++)result.add(value.slice(i,i+3));
  return result;
}
function headlineSimilarity(left,right) {
  const a=trigrams(compactTitle(left));
  const b=trigrams(compactTitle(right));
  if(!a.size||!b.size)return {dice:0,cover:0};
  let overlap=0;
  for(const piece of a)if(b.has(piece))overlap++;
  return {dice:2*overlap/(a.size+b.size),cover:overlap/Math.min(a.size,b.size)};
}
function numericClaims(title) {
  // Preserve decimals but treat thousands separators consistently.
  const standardized=String(title||"").replace(/(\d),(?=\d{3}(?:\D|$))/g,"$1");
  return new Set((standardized.match(/\d+(?:\.\d+)?/g)||[])
    .filter(value=>value!=="2026"&&value!=="2025"));
}
function relatedSameEvent(a,b) {
  const aTime=Date.parse(a.published||a.published_at||"");
  const bTime=Date.parse(b.published||b.published_at||"");
  if(!Number.isFinite(aTime)||!Number.isFinite(bTime)||
    Math.abs(aTime-bTime)>36*60*60*1000)return false;

  // A high-confidence named corporate event remains the same story even when
  // headlines emphasize different implications (ADR move, capital strategy).
  const keyA=highConfidenceEventKey(a),keyB=highConfidenceEventKey(b);
  if(keyA && keyA===keyB)return true;

  const numbersA=numericClaims(a.title);
  const numbersB=numericClaims(b.title);
  // Contradictory figures usually mean a different report or time snapshot.
  if(numbersA.size&&numbersB.size&&![...numbersA].some(n=>numbersB.has(n)))return false;
  const similarity=headlineSimilarity(a.title,b.title);
  const topicsA=new Set([a.topic,...(a.topics||[])]);
  const sharedTopic=[b.topic,...(b.topics||[])].some(topic=>topic&&topicsA.has(topic));
  return (similarity.dice>=0.54&&similarity.cover>=0.48) ||
    (sharedTopic&&similarity.dice>=0.40&&similarity.cover>=0.47);
}
export function groupRelatedReports(rows) {
  if(!Array.isArray(rows))return [];
  const groups=[];
  for(const item of rows) {
    const group=groups.find(list=>list.length<12 && relatedSameEvent(item,list[0]));
    if(group)group.push(item);
    else groups.push([item]);
  }
  return groups;
}
