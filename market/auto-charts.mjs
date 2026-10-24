import {mountCandleChart} from "./candle-chart.mjs";

const BASE="http://127.0.0.1:8765";
function el(id){return document.getElementById(id);}
function isoKstToday(){
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const part=(type)=>parts.find(x=>x.type===type)?.value;
 return part("year")+"-"+part("month")+"-"+part("day");
}
function koreaDay(){
 let date=new Date(isoKstToday()+"T00:00:00Z");
 // Display the last weekday as starting point; Korean holidays may still lack bars.
 while(date.getUTCDay()===0||date.getUTCDay()===6)date.setUTCDate(date.getUTCDate()-1);
 return date.toISOString().slice(0,10);
}
async function localJson(path,{timeout=14000}={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(BASE+path,{signal:controller.signal,cache:"no-store",credentials:"omit",mode:"cors"});
  const body=await response.json();
  if(!response.ok)throw Error(body?.error||"로컬 키움 서비스 조회 실패");
  return body;
 }finally{clearTimeout(timer);}
}
function safeErr(err){
 return err?.name==="AbortError"?"키움 조회가 시간 초과됐습니다. PC 인증 또는 네트워크 상태를 확인하세요.":
  err instanceof TypeError?"PC 키움 서비스에 연결되지 않았습니다. PC에서 로컬 조회기를 실행하고 브라우저의 로컬 네트워크 접근 권한을 허용하세요.":"키움 데이터 조회 실패: "+String(err?.message||"연결 오류");
}
export function setupAutoCharts(){
 const status=el("auto-chart-connection");
 if(!status)return {focusNews(){}};
 const name=el("chart-stock-name"),results=el("chart-symbol-results"),
       date=el("chart-date"),selection=el("chart-selected");
 const daily=mountCandleChart(el("chart-daily"),{kind:"daily",label:"일봉"});
 const minute=mountCandleChart(el("chart-minute"),{kind:"minute",label:"분봉"});
 date.value=koreaDay();
 date.max=isoKstToday();
 let chosen=null,searchId=0,chartId=0,timer=null,exchange="KRX";
 const marketNote=el("chart-market-note");
 const marketDescriptions={
   KRX:"KRX 단독 시세입니다. NXT 거래는 이 차트에 포함된 것으로 간주하지 않습니다.",
   NXT:"NXT(_NX) 조회자료입니다. 해당 종목·거래일에 키움 NXT 자료가 없으면 차트는 비워둡니다.",
   SOR:"키움 SOR(_AL) 자료입니다. SOR는 최선주문집행 경로이므로 KRX+NXT 완전 통합 거래량으로 검증되지 않았습니다."
 };
 function updateExchange(){
   for(const btn of document.querySelectorAll("[data-exchange]")){
     const chosen=btn.dataset.exchange===exchange;
     btn.classList.toggle("selected",chosen);
     btn.setAttribute("aria-pressed",String(chosen));
   }
   marketNote.textContent=marketDescriptions[exchange];
 }
 for(const button of document.querySelectorAll("[data-exchange]")){
   button.addEventListener("click",()=>{
     if(!["KRX","NXT","SOR"].includes(button.dataset.exchange))return;
     exchange=button.dataset.exchange;
     updateExchange();
     if(chosen)loadCharts();
   });
 }
 updateExchange();
 async function health(){
  try{
   const d=await localJson("/health",{timeout:1800});
   status.textContent=d.authConfigured
    ?"PC 키움 조회 서비스 연결됨 · 기존 REST 인증정보 설정 확인 (실제 시세 응답은 종목 조회 후 검증)"
    :"PC 조회 서비스는 실행 중이나 기존 키움 REST 인증정보가 연결되지 않았습니다. 기존 Scout 인증 모듈을 연결해야 합니다.";
   status.dataset.ready=d.authConfigured?"yes":"no";
   return true;
  }catch{
   status.textContent="PC 키움 자동조회 연결 안 됨 · 이 PC에서 조회 서비스 실행이 필요합니다. 휴대폰은 아직 PC 연결을 공유하지 않습니다.";
   status.dataset.ready="no";
   return false;
  }
 }
 function noResults(txt){
  const e=document.createElement("p");
  e.className="chart-query-note";e.textContent=txt;
  results.replaceChildren(e);
 }
 async function search(){
  const query=name.value.trim();
  const version=++searchId;
  chosen=null;
  chartId++;
  selection.textContent="검색한 종목을 선택하세요.";
  daily.setData([]);minute.setData([]);
  if(query.length<1){results.replaceChildren();return;}
  noResults("종목명을 조회 중입니다…");
  try{
   const response=await localJson("/symbols?q="+encodeURIComponent(query),{timeout:16000});
   if(version!==searchId)return;
   results.replaceChildren();
   if(!response.matches?.length){noResults("검색 결과가 없습니다. 이름을 다시 입력하거나 키움 연결을 확인하세요.");return;}
   for(const item of response.matches){
    const btn=document.createElement("button");
    btn.type="button";btn.className="chart-symbol";
    btn.textContent=item.name+" · "+item.code+(item.market?" · "+item.market:"");
    btn.addEventListener("click",()=>{
      if(version!==searchId)return;
      chosen=item;
      name.value=item.name;
      searchId++;
      results.replaceChildren();
      selection.textContent="선택된 종목: "+item.name+" ("+item.code+") · "+exchange+" · 기준일 "+date.value;
      loadCharts();
    });
    results.append(btn);
   }
  }catch(error){
   if(version!==searchId)return;
   noResults(safeErr(error));
   health();
  }
 }
 async function loadCharts(){
  if(!chosen)return;
  const version=++chartId;
  const selectedDay=date.value;
  if(!/^\d{4}-\d\d-\d\d$/.test(selectedDay))return;
  selection.textContent="선택된 종목: "+chosen.name+" ("+chosen.code+") · "+exchange+" · 조회 기준일 "+selectedDay;
  daily.setData([]);minute.setData([]);
  const kinds=[["daily",daily],["minute",minute]];
  await Promise.all(kinds.map(async([kind,chart])=>{
   const state=el("chart-"+kind+"-status");
   state.textContent="키움 "+(kind==="daily"?"일봉":"1분봉")+" 조회 중…";
   try{
    const data=await localJson("/chart?code="+encodeURIComponent(chosen.code)+
      "&kind="+kind+"&date="+encodeURIComponent(selectedDay)+"&exchange="+exchange,{timeout:24000});
    if(version!==chartId)return;
    if(data.market!==exchange){
      state.textContent="로컬 조회기가 이전 버전입니다. 새 연결기를 실행해야 "+exchange+" 데이터를 구분할 수 있습니다.";
      chart.setData([]);return;
    }
    if(!Array.isArray(data.bars)||!data.bars.length){
      state.textContent="해당 거래일의 "+(kind==="daily"?"일봉":"분봉")+"이 없습니다. 휴장일·인증·거래일을 확인하세요.";
      chart.setData([]);return;
    }
    chart.setData(data.bars);
    state.textContent="키움 "+data.source+" / "+data.market+" / "+data.count+"봉 조회 · "+selectedDay+
      (kind==="daily"?" 이전 일봉 포함":" 당일 1분봉")+" · 자동조회"+(data.aggregationVerified?" · 통합 검증됨":" · 거래소별 자료");
    if(exchange==="SOR"){
      marketNote.textContent=String(data.note||marketDescriptions.SOR);
    }
   }catch(error){
    if(version!==chartId)return;
    chart.setData([]);
    state.textContent=safeErr(error);
   }
  }));
 }
 name.addEventListener("input",()=>{
  clearTimeout(timer);
  timer=setTimeout(search,300);
 });
 name.addEventListener("keydown",e=>{
  if(e.key==="Enter"){e.preventDefault();clearTimeout(timer);search();}
 });
 date.addEventListener("change",()=>{if(chosen)loadCharts();});
 el("chart-refresh").addEventListener("click",async()=>{
  await health();
  if(chosen)loadCharts();else if(name.value.trim())search();
 });
 const notify=()=>{
  if(!chosen)status.textContent="먼저 PC의 키움 API 서비스를 켜고 종목명을 검색하세요.";
 };
 function focusNews(article){
  if(!article)return;
  // Don't automatically assume an RSS headline proves issuer identity.
  name.placeholder="해당 기사 종목명을 검색해 선택하세요: "+String(article.title||"").slice(0,45);
  notify();
 }
 health();
 return {focusNews};
}
