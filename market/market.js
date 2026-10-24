import {uniqueArticles,visibleArticles,groupRelatedReports} from "./feed-model.mjs";
import {setupFlowAnalyzer} from "./flow-ui.mjs";
import {setupAutoCharts} from "./auto-charts.mjs";
const q = (id) => document.getElementById(id);
const elements = {
  search:q("search"),watchlist:q("watchlist"),save:q("save-watch"),focus:q("keyword-focus"),
  status:q("feed-status"),count:q("count"),refresh:q("refresh"),
  articles:q("articles"),empty:q("empty"),groupToggle:q("group-toggle")
};
const autoCharts=setupAutoCharts();
const flow=setupFlowAnalyzer();
const STORAGE_KEY = "marketpasu_personal_keywords_v1";
const VIEW_KEY = "marketpasu_personal_news_view_v1";
const READ_KEY = "marketpasu_read_articles_v1";
const KNOWN_KEY = "marketpasu_known_articles_v1";
const GROUP_KEY = "marketpasu_group_related_v1";
const MAX_ITEMS = 80;
let allItems = [];
let groupedView = true;
try {groupedView = localStorage.getItem(GROUP_KEY)!=="off";} catch {}
let currentFilter = "all";
try {const saved=localStorage.getItem(VIEW_KEY);currentFilter=["all","watch","unread"].includes(saved)?saved:"all";} catch {}
function loadIDs(key){try {const ids=JSON.parse(localStorage.getItem(key)||"[]");return new Set(Array.isArray(ids)?ids.filter(v=>typeof v==="string").slice(-450):[]);}catch{return new Set();}}
function saveIDs(key,ids){try {localStorage.setItem(key,JSON.stringify([...ids].slice(-450)));}catch{}}
let readIds=loadIDs(READ_KEY);
let knownIds=loadIDs(KNOWN_KEY);
let newIds=new Set();
let watchKeywords = [];
let busy = false;
function setRead(id,read){if(read)readIds.add(id);else readIds.delete(id);saveIDs(READ_KEY,readIds);newIds.delete(id);}
function populateFocus(){
  const before=elements.focus.value;
  const all=node("option","","모든 관심 키워드");all.value="";
  const options=[all,...watchKeywords.map(value=>{const option=node("option","",value);option.value=value;return option;})];
  elements.focus.replaceChildren(...options);
  elements.focus.value=watchKeywords.includes(before)?before:"";
  elements.focus.disabled=watchKeywords.length===0;
}

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
      topic:clean(row?.topic,60)||"시장",
      topics:Array.isArray(row?.topics)?row.topics.slice(0,15).map(v=>clean(v,60)).filter(Boolean):[],
      firstObserved:clean(row?.first_observed,10),
      lastObserved:clean(row?.last_observed,10),
      observedDays:Number.isSafeInteger(row?.observed_days)&&row.observed_days>0&&row.observed_days<=30?row.observed_days:0,
      titleVariants:Number.isSafeInteger(row?.title_variants)&&row.title_variants>0&&row.title_variants<=3?row.title_variants:0
    };
  }).filter(Boolean).sort((a,b)=>Date.parse(b.published||0)-Date.parse(a.published||0));
}
function node(tag,className,text){
  const elem=document.createElement(tag);
  if(className)elem.className=className;
  if(text!==undefined)elem.textContent=String(text);
  return elem;
}
function articleCard(item,related=[]){
  const article=node("article","article"+(readIds.has(item.id)?" is-read":""));
  const meta=node("div","meta");
  meta.append(node("span","topic",item.topic),node("span","",item.publisher),
    node("span","",dateText(item.published)));
  const read=readIds.has(item.id);
  const readState=node("span","read-tag"+(read?" completed":""),read?"읽음":"안 읽음");
  meta.append(readState);
  if(newIds.has(item.id)&&!read)meta.append(node("span","new-tag","새로 추가됨"));
  const title=node("h3","",item.title);
  const actions=node("div","article-actions");
  const link=node("a","original","기사 원문 보기 ↗");
  link.href=item.url;
  link.target="_blank";
  link.rel="noopener noreferrer";
  link.setAttribute("aria-label",item.title+" 기사 원문 보기");
  link.addEventListener("click",()=>{
    setRead(item.id,true);
    // Let the browser open the source link before rebuilding article cards.
    setTimeout(render,0);
  });
  const toggle=node("button","mark-read",read?"읽지 않음으로":"읽음 표시");
  toggle.type="button";
  toggle.addEventListener("click",()=>{setRead(item.id,!readIds.has(item.id));render();});
  const flowButton=node("button","mark-read","뉴스·수급 비교");
  flowButton.type="button";
  flowButton.addEventListener("click",()=>flow.selectArticle(item.id));
  actions.append(link,toggle,flowButton);
  article.append(meta,title,actions);
  if(item.topics.length>1)article.append(node("p","topic-more","관련 주제: "+item.topics.join(" · ")));
  if(related.length){
    const details=node("details","related-reports");
    details.append(node("summary","","관련 보도 "+related.length+"건 펼치기 · 제목 유사성 기준"));
    details.append(node("p","related-note","같은 사건을 다룬 것으로 추정한 보도입니다. 원문별 내용은 다를 수 있습니다."));
    const items=node("ul","related-list");
    for(const other of related){
      const li=node("li","");
      const a=node("a","related-link",other.title);
      a.href=other.url;
      a.target="_blank";
      a.rel="noopener noreferrer";
      a.addEventListener("click",()=>{setRead(other.id,true);setTimeout(render,0);});
      li.append(a,node("span","related-publisher",other.publisher+" · "+dateText(other.published)));
      items.append(li);
    }
    details.append(items);
    article.append(details);
  }
  if(item.firstObserved && item.lastObserved){
    const details=node("details","observations");
    details.append(node("summary","","이 기사 관측 이력 보기"));
    const body=node("p","","처음 관측 "+item.firstObserved+" · 최근 관측 "+item.lastObserved+
      " · 최근 30일 서로 다른 관측일 "+item.observedDays+"일");
    details.append(body);
    if(item.titleVariants>1)details.append(node("p","change-notice",
      "같은 RSS 링크에서 제목 표현 차이가 기록됐습니다. 제목 변경 여부는 검증되지 않았습니다."));
    details.append(node("p","history-disclaimer",
      "마켓파수가 수집한 날짜만 나타냅니다. 기사 삭제·재발행·재탕 확정 자료가 아닙니다."));
    article.append(details);
  }
  return article;
}
function updateExternalSearchLink(){
  const link=q("external-news");
  const word=elements.search.value.trim();
  const query=word || (currentFilter==="watch" ? (elements.focus.value || watchKeywords.slice(0,3).join(" OR ")) : "");
  link.hidden=!query;
  if(!query)return;
  link.href="https://news.google.com/search?q="+encodeURIComponent(query)+"&hl=ko&gl=KR&ceid=KR%3Ako";
  link.textContent=word ? "Google 뉴스에서 ‘"+clean(word,35)+"’ 더 찾아보기 ↗"
    : "Google 뉴스에서 관심 종목 더 찾아보기 ↗";
}
function render(){
  updateExternalSearchLink();
  const rows=visibleArticles(allItems,{
    search:elements.search.value,filter:currentFilter,
    watchKeywords,focus:elements.focus.value,readIds
  });
  const groups=groupedView?groupRelatedReports(rows):rows.map(item=>[item]);
  const fragment=document.createDocumentFragment();
  for(const reports of groups)fragment.append(articleCard(reports[0],reports.slice(1)));
  elements.articles.replaceChildren(fragment);
  elements.empty.hidden=rows.length!==0;
  const unread=allItems.filter(item=>!readIds.has(item.id)).length;
  const collapsed=rows.length-groups.length;
  elements.count.textContent=groupedView
    ?"표시 "+groups.length+"개 · 원문 "+rows.length+"건 · 관련 보도 "+collapsed+"건 묶음 · 안 읽은 뉴스 "+unread+"건"
    :"표시 "+rows.length+"건 / 전체 "+allItems.length+"건 · 안 읽은 뉴스 "+unread+"건";
  elements.groupToggle.textContent=groupedView?"원문 전체 보기":"관련 보도 묶어 보기";
  elements.groupToggle.setAttribute("aria-pressed",String(groupedView));
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
    allItems=uniqueArticles(rows);
    flow.setArticles(allItems);
    newIds=knownIds.size===0?new Set():new Set(allItems.filter(item=>!knownIds.has(item.id)).map(item=>item.id));
    for(const item of allItems)knownIds.add(item.id);
    saveIDs(KNOWN_KEY,knownIds);
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
  populateFocus();
  render();
});
elements.search.addEventListener("input",render);
elements.focus.addEventListener("change",()=>{
  if(elements.focus.value){currentFilter="watch";try{localStorage.setItem(VIEW_KEY,currentFilter);}catch{}syncFilterButtons();}
  render();
});
function syncFilterButtons(){
  for(const child of document.querySelectorAll("[data-filter]")){
    const selected=child.dataset.filter===currentFilter;
    child.classList.toggle("selected",selected);
    child.setAttribute("aria-pressed",String(selected));
  }
}
for(const btn of document.querySelectorAll("[data-filter]")){
  btn.addEventListener("click",()=>{
    currentFilter=["watch","unread"].includes(btn.dataset.filter)?btn.dataset.filter:"all";
    try {localStorage.setItem(VIEW_KEY,currentFilter);} catch {}
    syncFilterButtons();
    render();
  });
}
populateFocus();
syncFilterButtons();
elements.groupToggle.addEventListener("click",()=>{
  groupedView=!groupedView;
  try {localStorage.setItem(GROUP_KEY,groupedView?"on":"off");} catch {}
  render();
});
elements.refresh.addEventListener("click",loadNews);
render();
loadNews();
