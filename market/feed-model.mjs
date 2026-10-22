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
