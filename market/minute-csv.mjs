/**
 * Browser-only, offline minute-bar CSV reader for Korean equities.
 * Assumptions are explicit: ticker verification and Korea time zone are user choices.
 * No data leaves the browser. No tick-to-bar inference or guessed OHLC data.
 */
const ALIASES={
  time:["일시","날짜시간","체결일시","체결시간","시간","datetime","timestamp","date","time"],
  open:["시가","open","openingprice"],
  high:["고가","high","highprice"],
  low:["저가","low","lowprice"],
  close:["종가","현재가","가격","close","closingprice"],
  volume:["거래량","volume","tradevolume"],
  turnover:["거래대금","누적아닌거래대금","turnover","tradevalue","amount"],
  buyVolume:["매수주도체결량","매수주도량","buyinitiatedvolume","buyvolume","매수체결량"],
  sellVolume:["매도주도체결량","매도주도량","sellinitiatedvolume","sellvolume","매도체결량"],
  ticker:["종목코드","단축코드","stockcode","ticker","code"]
};
const REQUIRED=["time","open","high","low","close"];
const MAX_CHARS=1_500_000;
function canonical(s){return String(s??"").replace(/^\uFEFF/,"").trim().toLowerCase().replace(/[\s_\-()/]/g,"");}
function splitCsv(input){
  const result=[];
  let row=[],cell="",quoted=false;
  for(let i=0;i<input.length;i++){
    const char=input[i];
    if(char==='"'){
      if(quoted&&input[i+1]==='"'){cell+='"';i++;}
      else if(!quoted&&cell.trim()!=="")throw Error("CSV 따옴표 형식을 확인하세요.");
      else quoted=!quoted;
    }else if(char===","&&!quoted){row.push(cell);cell="";}
    else if((char==="\n"||char==="\r")&&!quoted){
      if(char==="\r"&&input[i+1]==="\n")i++;
      row.push(cell);if(row.some(x=>x.trim()!==""))result.push(row);
      row=[];cell="";
    }else cell+=char;
  }
  if(quoted)throw Error("닫히지 않은 CSV 따옴표가 있습니다.");
  row.push(cell);if(row.some(x=>x.trim()!==""))result.push(row);
  return result;
}
function normalizedCode(code){
  const s=String(code??"").trim().replace(/^A(?=\d{6}$)/i,"");
  return /^\d{1,6}$/.test(s)?s.padStart(6,"0"):s.toUpperCase();
}
function offsetTime(raw,assumeKst){
  const input=String(raw||"").trim();
  if(!input)return null;
  const withOffset=/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/i;
  const local=/^\d{4}[-/.]\d\d[-/.]\d\d[T ]\d\d:\d\d(?::\d\d)?$/;
  let normalized=input;
  if(withOffset.test(normalized))normalized=normalized.replace(" ","T");
  else if(assumeKst && local.test(normalized)){
    normalized=normalized.replace(/[/.]/g,"-").replace(" ","T")+":00".repeat((normalized.match(/:/g)||[]).length===1)+"+09:00";
  }else return null;
  const d=new Date(normalized);
  return Number.isFinite(d.getTime())?d.toISOString():null;
}
function decimal(value){
  const raw=String(value??"").trim().replace(/,/g,"");
  if(!raw||!/^\d+(?:\.\d+)?$/.test(raw))return null;
  const num=Number(raw);
  return Number.isFinite(num)?num:null;
}
export function parseMinuteBarCsv(text,{assumeKst=false,ticker="",maxRows=5000}={}){
  if(typeof text!=="string"||!text.trim())throw Error("CSV 내용을 입력하거나 파일을 선택하세요.");
  if(text.length>MAX_CHARS)throw Error("CSV 크기가 너무 큽니다. 한 번에 1.5MB 이하만 읽습니다.");
  const all=splitCsv(text.replace(/^\uFEFF/,""));
  if(all.length<2)throw Error("첫 줄 열 제목과 분봉 데이터가 필요합니다.");
  const headers=all[0].map(canonical);
  const indexes={};
  for(const [field,names] of Object.entries(ALIASES)){
    indexes[field]=headers.findIndex(h=>names.some(alias=>canonical(alias)===h));
  }
  const missing=REQUIRED.filter(field=>indexes[field]<0);
  if(missing.length)throw Error("필수 열 누락: "+missing.join(", ")+" (일시, 시가, 고가, 저가, 종가)");
  if(all.length-1>maxRows)throw Error("분봉이 "+maxRows+"개를 초과했습니다. 분석 기간을 줄이세요.");
  const rows=[];
  let skipped=0,missingTimeZone=0,tickerMismatch=0;
  const wanted=normalizedCode(ticker);
  for(const parts of all.slice(1)){
    const get=key=>indexes[key]>=0?parts[indexes[key]]:null;
    const time=offsetTime(get("time"),assumeKst);
    if(!time){missingTimeZone++;skipped++;continue;}
    if(wanted&&indexes.ticker>=0&&normalizedCode(get("ticker"))!==wanted){
      tickerMismatch++;skipped++;continue;
    }
    const open=decimal(get("open")),high=decimal(get("high")),low=decimal(get("low")),close=decimal(get("close"));
    if([open,high,low,close].some(v=>v===null||v<=0)||
      high<Math.max(open,close)||low>Math.min(open,close)){skipped++;continue;}
    rows.push({time,open,high,low,close,
      volume:decimal(get("volume")),turnover:decimal(get("turnover")),
      buyVolume:decimal(get("buyVolume")),sellVolume:decimal(get("sellVolume"))});
  }
  if(rows.length===0)throw Error(missingTimeZone?"분봉 시각 형식이 맞지 않습니다. 한국시간 자료라면 KST 체크를 선택하세요.":"검증 가능한 분봉이 없습니다.");
  if(tickerMismatch>0&&indexes.ticker>=0){
    // Never let a partial multi-stock file masquerade as one stock's full timeline.
    throw Error("CSV에 입력 종목과 다른 종목 코드가 포함돼 있습니다. 단일 종목 파일을 사용하세요.");
  }
  return {bars:rows,skipped,columns:Object.fromEntries(Object.entries(indexes).map(([k,v])=>[k,v>=0])),
    inputCount:all.length-1,assumedKst:assumeKst};
}
