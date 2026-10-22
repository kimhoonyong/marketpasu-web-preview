const q = (id) => document.getElementById(id);
const elements = {
  search:q("search"),watchlist:q("watchlist"),save:q("save-watch"),
  status:q("feed-status"),count:q("count"),refresh:q("refresh"),
  articles:q("articles"),empty:q("empty")
};
const STORAGE_KEY = "marketpasu_personal_keywords_v1";
const MAX_ITEMS = 80;
let allItems = [];
let currentFilter = "all";
let watchKeywords = [];
let busy = false;

function readKeywords(){
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if(saved !== null) return saved.split(",").map(v=>v.trim()).filter(Boolean).slice(0,15);
  } catch {}
  return ["삼성전자","SK하이닉스","테슬라","명신산업"];
}
function writeKeywords(values){
  try {localStorage.setItem(STORAGE_KEY, values.join(", ")); return true;}
  catch {return false;}
}
function clean(value, length=240){
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,length) : "";
}
function safeLink(value){
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || !u.hostname) return null;
    return u.href;
  } catch {return null;}
}
function dateText(value){
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("ko-KR", {
    timeZone:"Asia/Seoul",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"
  }).format(date) : "발행시각 미확인";
}
function normalizeRows(payload){
  if(!payload || !Array.isArray(payload.items)) throw new Error("뉴스 데이터 형식 오류");
  return payload.items.slice(0,MAX_ITEMS).map(row=>{
    const url=safeLink(row?.url);
    const title=clean(row?.title,220);
    if(!url||!title) return null;
    return {
      id:clean(row?.id,90),title,url,
      publisher:clean(row?.publisher,90)||"출처 미상",
      published:clean(row?.published_at,45),
      topic:clean(row?.topic,60)||"시장"
    };
  }).filter(Boolean).sort((a,b)=>Date.parse(b.published||0)-Date.parse(a.published||0));
}
function node(tag,className,text){
  const elem=document.createElement(tag);
  if(className)elem.className=className;
  if(text!==undefined)elem.textContent=String(text);
  return elem;
}
function articleCard(item){
  const article=node("article","article");
  const meta=node("div","meta");
  meta.append(node("span","topic",item.topic),node("span","",item.publisher),
    node("span","",dateText(item.published)));
  const title=node("h3","",item.title);
  const link=node("a","original","기사 원문 보기 ↗");
  link.href=item.url;
  link.target="_blank";
  link.rel="noopener noreferrer";
  link.setAttribute("aria-label",item.title+" 기사 원문 보기");
  article.append(meta,title,link);
  return article;
}
function render(){
  const term=elements.search.value.trim().toLocaleLowerCase("ko-KR");
  const terms=watchKeywords.map(v=>v.toLocaleLowerCase("ko-KR"));
  const rows=allItems.filter(item=>{
    const haystack=[item.title,item.publisher,item.topic].join(" ").toLocaleLowerCase("ko-KR");
    return (!term || haystack.includes(term)) &&
      (currentFilter!=="watch" || terms.some(word=>haystack.includes(word)));
  });
  const fragment=document.createDocumentFragment();
  for(const item of rows)fragment.append(articleCard(item));
  elements.articles.replaceChildren(fragment);
  elements.empty.hidden=rows.length!==0;
  elements.count.textContent="표시 "+rows.length+"건 / 전체 "+allItems.length+"건";
}
async function loadNews(){
  if(busy)return;
  busy=true;
  elements.refresh.disabled=true;
  elements.status.textContent="공개 뉴스 파일 확인 중…";
  try{
    const response=await fetch("./news.json?revision="+Date.now(),{cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const data=await response.json();
    const rows=normalizeRows(data);
    if(rows.length===0)throw new Error("표시 가능한 기사가 없습니다");
    allItems=rows;
    const when = data.updated_at && Number.isFinite(Date.parse(data.updated_at)) ?
      "자동 갱신 "+dateText(data.updated_at) :
      "첫 확인 기사 기준일 "+(clean(data.snapshot_date,10)||"미확인");
    elements.status.textContent=when+" · 공개 뉴스 "+allItems.length+"건 (실시간 시세 아님)";
    render();
  }catch(err){
    elements.status.textContent=allItems.length ?
      "갱신 실패 · 마지막으로 표시된 기사 유지" :
      "뉴스를 불러오지 못했습니다. 나중에 새 소식 확인을 눌러주세요.";
    if(allItems.length===0)render();
  }finally{
    busy=false;
    elements.refresh.disabled=false;
  }
}
watchKeywords=readKeywords();
elements.watchlist.value=watchKeywords.join(", ");
elements.save.addEventListener("click",()=>{
  const values=elements.watchlist.value.split(",").map(v=>v.trim()).filter(Boolean).slice(0,15);
  watchKeywords=values;
  elements.watchlist.value=values.join(", ");
  elements.save.textContent=writeKeywords(values)?"저장됨":"저장 제한 · 현재 탭에만 적용";
  render();
});
elements.search.addEventListener("input",render);
for(const btn of document.querySelectorAll("[data-filter]")){
  btn.addEventListener("click",()=>{
    currentFilter=btn.dataset.filter;
    for(const child of document.querySelectorAll("[data-filter]")){
      const selected=child.dataset.filter===currentFilter;
      child.classList.toggle("selected",selected);
      child.setAttribute("aria-pressed",String(selected));
    }
    render();
  });
}
elements.refresh.addEventListener("click",loadNews);
render();
loadNews();
