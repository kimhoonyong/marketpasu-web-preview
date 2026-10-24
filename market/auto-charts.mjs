import {mountCandleChart} from "./candle-chart.mjs";
import {minuteTimeframe,MINUTE_PERIODS} from "./bar-analytics.mjs";
import {localAuthExplanation} from "./local-auth-status.mjs";
import {explainLiveKiwoom} from "./live-kiwoom-diagnostic.mjs";
import {localApiCompatibility,localApiHelp} from "./local-api-protocol.mjs";

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
  if(!response.ok){
    const error=new Error(body?.error||"로컬 키움 서비스 조회 실패");
    error.stage=body?.stage;
    error.reason=body?.reason;
    error.httpStatus=response.status;
    throw error;
  }
  return body;
 }finally{clearTimeout(timer);}
}
function safeErr(err){
 if(err?.httpStatus===404)return "PC 로컬 조회기의 요청 경로가 현재 마켓파수 웹과 일치하지 않습니다. 기존 검은색 연결기를 종료하고 새 버전을 실행하세요.";
 if(err?.stage&&err?.reason)
   return "키움 데이터 조회 실패: "+explainLiveKiwoom("FAILED",err.stage,err.reason).text;
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
 const dailyChoice=el("chart-daily-period");
 const dailyTitle=el("chart-daily-label");
 const labelDaily={daily:"일봉",weekly:"주봉",monthly:"월봉"};
 dailyChoice.addEventListener("change",()=>{
   const mode=dailyChoice.value;
   if(!labelDaily[mode])return;
   daily.setTimeframe(mode);
   dailyTitle.textContent=labelDaily[mode]+" — 키움 일봉 원자료로 계산";
   const state=el("chart-daily-status");
   const base=state.dataset.sourceStatus||state.textContent;
   state.textContent=base+(mode==="daily"?"":" · 현재 "+labelDaily[mode]+" 표시(실제 일봉을 묶어 생성)");
 });
 date.value=koreaDay();
 date.max=isoKstToday();
 let chosen=null,searchId=0,chartId=0,timer=null,exchange="KRX",localProtocolReady=false;
 let minuteRaw=[],period=1,minuteHistory=null;
 const minuteChoice=el("chart-minute-period");
 const minuteHeading=el("chart-minute-label");
 function applyMinutePeriod(){
   minuteHeading.textContent=period+"분봉 — 조회일 장중 흐름";
   const converted=minuteTimeframe(minuteRaw,period);
   minute.setData(converted);
   const state=el("chart-minute-status");
   if(minuteRaw.length){
     const dates=minuteHistory?minuteHistory.first+" ~ "+minuteHistory.last:"날짜 확인 필요";
     state.textContent="키움 실제 분봉 "+dates+" · 1분봉 "+minuteRaw.length+"개 → "+period+
       "분봉 "+converted.length+"개 · 과거 거래일 포함"+
       (minuteHistory?.legacy?" · 구형 PC 조회기: 이전 날짜 미제공 가능":"");
   }
 }
 minuteChoice.addEventListener("change",()=>{
   const value=Number(minuteChoice.value);
   if(!MINUTE_PERIODS.includes(value))return;
   period=value;applyMinutePeriod();
 });
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
 const diagnostic=el("chart-auth-diagnostics");
 const diagnosticText=el("chart-auth-explanation");
 const liveResult=el("chart-live-result");
 const liveButton=el("chart-live-diagnose");
 liveButton.addEventListener("click",async()=>{
   liveResult.hidden=false;
   liveButton.disabled=true;
   try{
     if(!await health()){
       liveResult.textContent="PC 연결기 버전·기존 인증 상태를 먼저 확인하세요.";
       return;
     }
     liveResult.textContent="기존 인증으로 키움 서버의 종목목록을 1회 조회하고 있습니다…";
     const data=await localJson("/diagnose",{timeout:24000});
     liveResult.textContent=explainLiveKiwoom(data.state,data.stage,data.reason).text;
   }catch(error){
     liveResult.textContent=safeErr(error);
   }finally{
     liveButton.disabled=false;
   }
 });
 async function health(){
  try{
   const d=await localJson("/health",{timeout:1800});
   const compatibility=localApiCompatibility(d);
   localProtocolReady=compatibility.compatible;
   if(!compatibility.compatible){
     status.textContent="PC 키움 연결기 버전 불일치 · 기존 연결기 교체 필요";
     status.dataset.ready="no";
     diagnosticText.textContent=localApiHelp(compatibility.reason);
     diagnostic.hidden=false;
     liveButton.disabled=true;
     return false;
   }
   liveButton.disabled=false;
   const explanation=localAuthExplanation(d.authConfigured===true,d.authStatus);
   status.textContent=explanation.heading;
   status.dataset.ready=d.authConfigured===true?"yes":"no";
   if(d.authConfigured===true){
     diagnostic.hidden=true;
   }else{
     diagnosticText.textContent=explanation.guide;
     diagnostic.hidden=false;
   }
   return d.authConfigured===true;
  }catch{
   localProtocolReady=false;
   status.textContent="PC 키움 로컬 조회 서비스에 연결하지 못했습니다. 실행창과 포트 8765를 확인하세요.";
   status.dataset.ready="no";
   diagnosticText.textContent="기존 PC 로컬 연결기의 검은색 창이 열려 있는지 확인하세요. API 키를 입력하거나 전송할 필요는 없습니다.";
   diagnostic.hidden=false;
   return false;
  }
 }
 el("chart-auth-recheck").addEventListener("click",async()=>{
   const ready=await health();
   if(ready&&name.value.trim())search();
 });
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
  daily.setData([]);minuteRaw=[];minuteHistory=null;minute.setData([]);
  if(query.length<1){results.replaceChildren();return;}
  noResults("종목명을 조회 중입니다…");
  try{
   // A previous local process can still answer /health successfully while
   // lacking the /symbols route. Never confuse that with broker rejection.
   if(!localProtocolReady && !await health()){
     if(version===searchId)noResults("PC 연결기 버전 또는 인증을 먼저 확인하세요. 위의 안내를 확인해 주세요.");
     return;
   }
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
   const message=safeErr(error);
   noResults(message);
   // /health only checks decrypted local credentials, NOT an actual broker
   // session. Keep the live-test CTA visible when name lookup fails.
   diagnostic.hidden=false;
   diagnosticText.textContent="인증파일은 읽었지만 키움 서버 조회가 실패했습니다. '키움 실제 API 진단'으로 토큰/종목목록 단계를 확인할 수 있습니다.";
  }
 }
 async function loadCharts(){
  if(!chosen)return;
  if(!localProtocolReady && !await health())return;
  const version=++chartId;
  const selectedDay=date.value;
  if(!/^\d{4}-\d\d-\d\d$/.test(selectedDay))return;
  selection.textContent="선택된 종목: "+chosen.name+" ("+chosen.code+") · "+exchange+" · 조회 기준일 "+selectedDay;
  daily.setData([]);minuteRaw=[];minuteHistory=null;minute.setData([]);
  const kinds=[["daily",daily],["minute",minute]];
  await Promise.all(kinds.map(async([kind,chart])=>{
   const state=el("chart-"+kind+"-status");
   state.textContent="키움 "+(kind==="daily"?"최대 1,200개 일봉":"최대 8,000개·과거 최대 21일 분봉")+
    " 조회 중… 실제 제공 범위만 표시됩니다.";
   try{
    const data=await localJson("/chart?code="+encodeURIComponent(chosen.code)+
      "&kind="+kind+"&date="+encodeURIComponent(selectedDay)+"&exchange="+exchange,{timeout:85000});
    if(version!==chartId)return;
    if(data.market!==exchange){
      state.textContent="로컬 조회기가 이전 버전입니다. 새 연결기를 실행해야 "+exchange+" 데이터를 구분할 수 있습니다.";
      if(kind==="minute"){minuteRaw=[];minuteHistory=null;}
      chart.setData([]);return;
    }
    if(!Array.isArray(data.bars)||!data.bars.length){
      state.textContent="해당 거래일의 "+(kind==="daily"?"일봉":"분봉")+"이 없습니다. 휴장일·인증·거래일을 확인하세요.";
      if(kind==="minute"){minuteRaw=[];minuteHistory=null;}
      chart.setData([]);return;
    }
    const sourceFirst=(data.firstAvailableDate||data.bars[0]?.date||data.bars[0]?.time?.slice(0,10)||"").slice(0,10);
    const sourceLast=(data.lastAvailableDate||data.bars[data.bars.length-1]?.date||
      data.bars[data.bars.length-1]?.time?.slice(0,10)||"").slice(0,10);
    const legacy=!data.historyScope;
    if(kind==="minute"){
      minuteRaw=data.bars;
      minuteHistory={first:sourceFirst,last:sourceLast,legacy};
      applyMinutePeriod();
    }else{
      chart.setData(data.bars);
    }
    const lag=Number(data.lastAvailableLagDays);
    const stale=kind==="daily"&&Number.isFinite(lag)&&lag>10;
    state.textContent="키움 "+data.source+" · "+data.market+" · "+sourceFirst+" ~ "+sourceLast+
      " · 실제 "+data.count+"봉 조회"+(legacy?" · 구형 PC 조회기: 이전 기간 자료 제한 가능":"")+
      (stale?" · ⚠ 마지막 일봉이 선택 기준일보다 "+lag+"일 오래되었습니다. 키움 응답 날짜를 확인하세요.":"")+
      " · 실제 제공 범위까지만 표시";
    if(kind==="daily"){
      state.dataset.sourceStatus=state.textContent;
      if(dailyChoice.value!=="daily")state.textContent+=" · 현재 "+labelDaily[dailyChoice.value]+" 표시(일봉 합성)";
    }
    if(exchange==="SOR"){
      marketNote.textContent=String(data.note||marketDescriptions.SOR);
    }
   }catch(error){
    if(version!==chartId)return;
    if(kind==="minute"){minuteRaw=[];minuteHistory=null;}
    chart.setData([]);
    state.textContent=safeErr(error);
    diagnostic.hidden=false;
    diagnosticText.textContent="차트 API 요청이 실패했습니다. 위의 '키움 실제 API 진단' 버튼으로 토큰과 종목목록 연결부터 확인할 수 있습니다.";
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
