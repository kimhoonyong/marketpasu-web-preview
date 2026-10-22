/**
 * Bounded, explicit ticker+KST-session storage format.
 * These helpers are pure; IndexedDB integration lives in local-bar-store.mjs.
 */
import {validatedOneMinuteBars} from "./accumulation-evidence.mjs";
import {stockKey} from "./stock-hints.mjs";

const KST=9*60*60*1000;
export function kstDay(iso){
 const ms=Date.parse(iso);
 return Number.isFinite(ms)?new Date(ms+KST).toISOString().slice(0,10):"";
}
export function prepareDailySeries(ticker,bars,{limit=1200}={}){
 const code=stockKey(ticker);
 if(!code)throw Error("먼저 유효한 종목코드를 입력해야 합니다.");
 const grouped=new Map();
 for(const bar of validatedOneMinuteBars(bars)){
  const day=kstDay(new Date(bar.time).toISOString());
  if(!day)continue;
  if(!grouped.has(day))grouped.set(day,[]);
  grouped.get(day).push({...bar,time:new Date(bar.time).toISOString()});
 }
 return [...grouped].map(([day,data])=>({
  id:code+":"+day,stockCode:code,kstDate:day,bars:data.slice(-limit),
  savedAt:new Date().toISOString(),source:"user_imported_verified_minute_csv"
 }));
}
export function combineSession(oldSeries,newSeries,{limit=1200}={}){
 if(oldSeries?.id!==newSeries?.id)throw Error("다른 종목·거래일의 데이터는 병합할 수 없습니다.");
 const merged=new Map();
 for(const row of [...(oldSeries?.bars||[]),...(newSeries.bars||[])]){
  if(row?.time)merged.set(row.time,row);
 }
 const sorted=[...merged.values()].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
 return {...newSeries,bars:sorted.slice(-limit)};
}
export function chooseArticleSeries(series,ticker,publishedAt){
 const code=stockKey(ticker),ts=Date.parse(publishedAt);
 if(!code||!Number.isFinite(ts)||!Array.isArray(series))return null;
 // Never silently borrow a different stock or a session with no bars around the news.
 const candidates=series.filter(x=>x.stockCode===code&&Array.isArray(x.bars))
  .map(x=>({
    record:x,
    relevant:x.bars.filter(b=>{
      const d=Date.parse(b.time);return d>=ts-120*60000&&d<=ts+30*60000;
    }).length
  })).filter(x=>x.relevant>0)
  .sort((a,b)=>b.relevant-a.relevant);
 return candidates[0]?.record||null;
}
