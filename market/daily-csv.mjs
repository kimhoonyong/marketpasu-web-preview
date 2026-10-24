/** Browser-local Kiwoom ka10081 daily CSV reader: no data transmission. */
import {validateDailyBars} from "./daily-support.mjs";
const COLUMN={
 date:["일자","날짜","date","거래일"],
 ticker:["종목코드","ticker","code","stockcode"],
 open:["시가","open"],high:["고가","high"],low:["저가","low"],
 close:["종가","현재가","close"],volume:["거래량","volume"],
 turnover:["거래대금","turnover","tradevalue"]
};
function canonical(t){return String(t??"").replace(/^\uFEFF/,"").trim().toLowerCase().replace(/[\s_()\-/]/g,"");}
function split(text){
 let cells=[],rows=[],cell="",quote=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){
   if(quote&&text[i+1]==='"'){cell+='"';i++;}
   else if(!quote&&cell.trim())throw Error("CSV 따옴표 형식을 확인하세요.");
   else quote=!quote;
  }else if(c===","&&!quote){cells.push(cell);cell="";}
  else if((c==="\n"||c==="\r")&&!quote){
   if(c==="\r"&&text[i+1]==="\n")i++;
   cells.push(cell);if(cells.some(x=>x.trim()))rows.push(cells);
   cells=[];cell="";
  }else cell+=c;
 }
 if(quote)throw Error("닫히지 않은 CSV 따옴표가 있습니다.");
 cells.push(cell);if(cells.some(x=>x.trim()))rows.push(cells);
 return rows;
}
function numeric(v){const t=String(v??"").trim().replace(/,/g,"");if(!t||!/^\d+(?:\.\d+)?$/.test(t))return null;const n=Number(t);return Number.isFinite(n)?n:null;}
function dateValue(v){
 const s=String(v||"").trim();
 if(/^\d{8}$/.test(s))return s.slice(0,4)+"-"+s.slice(4,6)+"-"+s.slice(6);
 if(/^\d{4}[-/.]\d\d[-/.]\d\d$/.test(s))return s.replace(/[/.]/g,"-");
 return "";
}
function stockKey(v){
 const s=String(v||"").trim().toUpperCase().replace(/^A(?=\d{6}$)/,"");
 return /^\d{1,6}$/.test(s)?s.padStart(6,"0"):s;
}
export function parseDailyBarCsv(text,{ticker="",maxRows=500}={}){
 if(typeof text!=="string"||!text.trim())throw Error("일봉 CSV 파일 또는 붙여넣기가 필요합니다.");
 if(text.length>1_000_000)throw Error("일봉 CSV는 1MB 이하만 허용합니다.");
 const rows=split(text.replace(/^\uFEFF/,""));
 if(rows.length<2)throw Error("CSV 헤더와 일봉이 필요합니다.");
 const headers=rows[0].map(canonical);
 const indexes={};
 for(const [key,aliases] of Object.entries(COLUMN))
  indexes[key]=headers.findIndex(v=>aliases.some(a=>canonical(a)===v));
 if(["date","open","high","low","close"].some(k=>indexes[k]<0))
  throw Error("필수 열: 일자, 시가, 고가, 저가, 종가");
 if(rows.length-1>maxRows)throw Error("일봉은 "+maxRows+"개 이하만 한 번에 입력하세요.");
 const expected=stockKey(ticker);
 let dropped=0;
 const parsed=[];
 for(const row of rows.slice(1)){
  const get=k=>indexes[k]<0?null:row[indexes[k]];
  if(expected&&indexes.ticker>=0&&stockKey(get("ticker"))!==expected)
   throw Error("다른 종목이 섞인 CSV는 사용할 수 없습니다.");
  const date=dateValue(get("date"));
  const open=numeric(get("open")),high=numeric(get("high")),low=numeric(get("low")),close=numeric(get("close"));
  if(!date||[open,high,low,close].some(v=>v===null)){dropped++;continue;}
  parsed.push({date,open,high,low,close,volume:numeric(get("volume")),turnover:numeric(get("turnover"))});
 }
 const validated=validateDailyBars(parsed);
 if(validated.length<1)throw Error("유효한 일봉 데이터가 없습니다. 날짜와 가격 열을 확인하세요.");
 return {bars:validated,submitted:rows.length-1,skipped:dropped+parsed.length-validated.length,
   hasTurnover:indexes.turnover>=0,hasVolume:indexes.volume>=0,
   tickerColumnPresent:indexes.ticker>=0};
}
