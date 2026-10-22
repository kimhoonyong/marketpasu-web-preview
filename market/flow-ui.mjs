import {parseMinuteBarCsv} from "./minute-csv.mjs";
import {assessNewsAccumulationEvidence} from "./accumulation-evidence.mjs";

function elem(tag,className="",value=""){
  const e=document.createElement(tag);
  if(className)e.className=className;
  if(value)e.textContent=value;
  return e;
}
const STATUS_LABELS={
  NOT_ASSESSABLE:"분석 보류 — 필요한 자료 부족",
  ACCUMULATION_LIKE_CLUES:"뉴스 이전 매수·거래 집중의 유사 흔적 관측",
  POST_NEWS_DISTRIBUTION_WATCH:"뉴스 전 급등·이후 매도 압력 주의",
  POST_NEWS_SELL_PRESSURE_WATCH:"뉴스 이후 매도 주도 체결 신호 주의",
  NO_CLEAR_EVIDENCE:"뚜렷한 수급 단서 미검출 (안전 판정 아님)"
};
const SIGNAL_LABELS={
 PRE_NEWS_ABSORPTION_LIKE:"뉴스 전 거래대금 증가, 매수 주도 체결과 가격 지지",
 PRE_NEWS_TURNOVER_EXPANSION:"뉴스 이전 거래대금 증가",
 PRE_NEWS_BUY_INITIATED_SHARE:"뉴스 이전 매수 주도 체결 비중 확대",
 POST_NEWS_SELL_PRESSURE:"뉴스 이후 주가 하락과 매도 주도 체결",
 POST_NEWS_BUY_FOLLOW_THROUGH:"뉴스 이후 매수 주도 체결 및 가격 지지",
 PRE_NEWS_RUNUP_AND_RETRACE:"뉴스 이전 급등 뒤 고점 대비 하락"
};
const METRICS=[
  ["beforePriceChangePct","뉴스 직전 1시간 등락률","%"],
  ["beforeRangePct","뉴스 직전 1시간 고저 범위","%"],
  ["turnoverBaselineRatio","뉴스 이전 거래대금 증가 배율","배"],
  ["volumeBaselineRatio","뉴스 이전 거래량 증가 배율","배"],
  ["buyInitiatedShareBeforePct","뉴스 이전 매수 주도 체결 비율","%"],
  ["buyInitiatedShareAfterPct","뉴스 이후 매수 주도 체결 비율","%"],
  ["afterPriceChangePct","뉴스 이후 가격 변화","%"],
  ["highVersusBaselinePct","뉴스 이전 기준 대비 최대 상승률","%"],
  ["retreatFromHighPct","뉴스 게시 전 고점 대비 후퇴","%"]
];

export function setupFlowAnalyzer(){
  const el=id=>document.getElementById(id);
  const panel=el("money-flow-panel"),select=el("flow-article"),form=el("flow-form");
  const file=el("flow-file"),paste=el("flow-paste"),result=el("flow-result");
  let articles=[];
  function setArticles(rows){
    articles=Array.isArray(rows)?rows:[];
    const value=select.value;
    const placeholder=elem("option","","분석할 뉴스 1건을 선택하세요");
    placeholder.value="";
    const options=[placeholder];
    for(const row of articles){
      const opt=elem("option","",(row.publisher+" · "+row.title).slice(0,145));
      opt.value=row.id;
      options.push(opt);
    }
    select.replaceChildren(...options);
    select.value=articles.some(a=>a.id===value)?value:"";
  }
  function selectArticle(id){
    if(!articles.some(a=>a.id===id))return;
    panel.open=true;
    select.value=id;
    panel.scrollIntoView({block:"start",behavior:"smooth"});
  }
  function renderError(message){
    result.replaceChildren(elem("p","flow-error",message));
  }
  function renderAnalysis(analysis,sourceName,csv){
    const wrap=elem("div");
    const heading=elem("h3","",STATUS_LABELS[analysis.status]||"분석 결과");
    heading.className=analysis.status==="NOT_ASSESSABLE"?"flow-unknown":"flow-evidence";
    wrap.append(heading,elem("p","flow-caption",
      "대조 기사: "+sourceName+" · 유효 1분봉 "+csv.bars.length+"개 / 입력 "+csv.inputCount+"줄 (제외 "+csv.skipped+"줄)"));
    if(analysis.dataStatus==="PRE_ONLY"){
      wrap.append(elem("p","flow-warning","뉴스 이후 30분 구간이 부족하므로 사전 관측만 제한적으로 표시합니다."));
    }
    if(analysis.signals.length){
      const title=elem("strong","","관측된 신호");
      const ul=elem("ul","flow-signals");
      for(const s of analysis.signals)ul.append(elem("li","",SIGNAL_LABELS[s.code]||s.description));
      wrap.append(title,ul);
    }
    const entries=METRICS.filter(([key])=>analysis.metrics[key]!==null&&analysis.metrics[key]!==undefined);
    if(entries.length){
      const details=elem("details","flow-metrics");
      const caption=elem("summary","","분봉 계산 근거 "+entries.length+"개 보기");
      const dl=elem("dl");
      for(const [key,label,unit] of entries){
        dl.append(elem("dt","",label),elem("dd","",analysis.metrics[key]+unit));
      }
      details.append(caption,dl);
      wrap.append(details);
    }
    for(const note of analysis.notes)wrap.append(elem("p","flow-note",note));
    wrap.append(elem("p","flow-warning",analysis.disclaimer));
    wrap.append(elem("p","flow-note","뉴스 시각은 Google 뉴스 RSS에 표시된 게시시각이며 최초 언론사 보도시각은 확인하지 않았습니다. 매수·매도 체결 방향만으로 투자자의 실제 순매수·보유 변화를 확인할 수 없습니다."));
    result.replaceChildren(wrap);
  }
  file.addEventListener("change",async()=>{
    const input=file.files?.[0];
    if(!input)return;
    if(input.size>1_500_000){renderError("CSV 파일이 1.5MB를 초과했습니다. 필요한 시간 구간만 선택하세요.");return;}
    try{
      const bytes=await input.arrayBuffer();
      let decoded;
      try{decoded=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}
      catch{decoded=new TextDecoder("euc-kr",{fatal:true}).decode(bytes);}
      paste.value=decoded;
      result.replaceChildren(elem("p","flow-note","파일이 브라우저에 불러와졌습니다. 아래에서 분석을 실행하세요. 서버로 업로드되지 않습니다."));
    }catch{renderError("CSV 파일을 읽지 못했습니다. 인코딩을 확인하거나 내용을 직접 붙여넣으세요.");}
  });
  form.addEventListener("submit",event=>{
    event.preventDefault();
    const item=articles.find(row=>row.id===select.value);
    if(!item){renderError("분석할 뉴스를 선택하세요.");return;}
    const stockCode=el("flow-ticker").value.trim();
    if(!stockCode){renderError("종목코드를 입력하세요.");return;}
    if(!el("flow-match").checked){renderError("뉴스와 분봉이 같은 종목인지 확인해야 합니다.");return;}
    let csv;
    try{csv=parseMinuteBarCsv(paste.value,{assumeKst:el("flow-kst").checked,ticker:stockCode});}
    catch(error){renderError("CSV 확인: "+String(error?.message||error));return;}
    const strongSide=el("flow-side").checked&&csv.columns.buyVolume&&csv.columns.sellVolume;
    const assessment=assessNewsAccumulationEvidence({
      publishedAt:item.published,bars:csv.bars,matchedStock:true,
      aggressorSideVerified:strongSide,earliestSourceVerified:false,stockCode
    });
    renderAnalysis(assessment,item.title,csv);
  });
  return {setArticles,selectArticle};
}
