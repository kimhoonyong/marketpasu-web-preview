import {SAMPLE_NEWS,LABELS,counts,filterNews} from "./demo-data.mjs";

const $=id=>document.getElementById(id);
const nodes={mode:$("search-mode"),search:$("search-input"),status:$("filter-select"),
  list:$("article-list"),empty:$("empty-state"),summary:$("search-summary"),
  focus:$("focus-news"),reset:$("reset-filters")};

function make(tag,classname,text){
  const item=document.createElement(tag);
  if(classname)item.className=classname;
  if(text!==undefined)item.textContent=text;
  return item;
}
function createItem(item){
  const box=make("article","article");
  const head=make("div","article-top");
  const tag=make("span","tag "+item.status,LABELS[item.status]);
  head.append(tag,make("span","muted",item.stock+" · "+item.category),
    make("span","muted","가상 기록 "+item.id));
  box.append(head,make("h3","",item.title),make("p","",item.description));
  const stats=make("div","article-stats");
  stats.append(make("span","","최초 보도 "+item.firstPublished),
    make("span","","최근 관측 "+item.lastSeen),
    make("span","","관측 횟수 "+item.observations+"회"));
  box.append(stats);
  const detail=make("details","");
  const summary=make("summary","","관측 이력 자세히 보기");
  const body=make("div","detail-grid");
  for(const [name,value] of [
    ["최초 보도(가상)",item.firstPublished],
    ["최초 수집(가상)",item.firstCollected],
    ["최근 재관측(가상)",item.lastSeen]
  ]){
    const cell=make("div","");
    cell.append(make("small","",name),make("strong","",value));
    body.append(cell);
  }
  detail.append(summary,body,make("p","muted","이 기록은 테스트용으로 작성한 합성 데이터이며 실제 언론 보도 또는 시장 정보가 아닙니다."));
  box.append(detail);
  return box;
}
function render(){
  const filtered=filterNews(SAMPLE_NEWS,{text:nodes.search.value,mode:nodes.mode.value,status:nodes.status.value});
  const c=counts(filtered);
  for(const [name,value] of Object.entries(c))$("metric-"+name).textContent=String(value);
  const fragment=document.createDocumentFragment();
  for(const item of filtered)fragment.append(createItem(item));
  nodes.list.replaceChildren(fragment);
  nodes.empty.hidden=filtered.length>0;
  nodes.summary.textContent="조건에 맞는 샘플 "+filtered.length+"건 / 전체 "+SAMPLE_NEWS.length+"건 · 100% 가상 데이터";
}
for(const node of [nodes.mode,nodes.search,nodes.status]){
  node.addEventListener(node===nodes.search?"input":"change",render);
}
nodes.reset.addEventListener("click",()=>{
  nodes.mode.value="all";
  nodes.search.value="";
  nodes.status.value="all";
  render();
  nodes.search.focus();
});
nodes.focus.addEventListener("click",()=>$("news").scrollIntoView({behavior:"smooth",block:"start"}));
render();
