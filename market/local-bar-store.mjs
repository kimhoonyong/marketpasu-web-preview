/**
 * IndexedDB market-bar cache, opt-in only.
 * No network, server, telemetry, broker credentials, or Firebase involvement.
 */
import {prepareDailySeries,combineSession,chooseArticleSeries} from "./market-bar-cache.mjs";
import {stockKey} from "./stock-hints.mjs";

const DB_NAME="marketpasu-personal-minute-bars-v1";
const STORE="marketbars";
function requestPromise(request){
 return new Promise((resolve,reject)=>{
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error("브라우저 저장소 작업 실패"));
 });
}
function openDatabase(){
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==="undefined"){reject(Error("이 브라우저에서 분봉 로컬 저장을 지원하지 않습니다."));return;}
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{
    if(!request.result.objectStoreNames.contains(STORE))
      request.result.createObjectStore(STORE,{keyPath:"id"});
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error("로컬 분봉 저장소 열기 실패"));
  request.onblocked=()=>reject(Error("다른 마켓파수 탭에서 데이터베이스를 사용 중입니다."));
 });
}
async function withStore(mode,fn){
 const db=await openDatabase();
 try{
  const txn=db.transaction(STORE,mode);
  const store=txn.objectStore(STORE);
  const request=fn(store);
  const result=await requestPromise(request);
  await new Promise((resolve,reject)=>{
    txn.oncomplete=()=>resolve();
    txn.onerror=()=>reject(txn.error||Error("브라우저 저장소 처리 실패"));
    txn.onabort=()=>reject(txn.error||Error("브라우저 저장소 처리가 취소됐습니다."));
  });
  return result;
 }finally{db.close();}
}
async function allRecords(){
 return withStore("readonly",store=>store.getAll());
}
export async function saveImportedMinuteBars(ticker,bars){
 const series=prepareDailySeries(ticker,bars);
 if(!series.length)throw Error("저장할 유효한 분봉이 없습니다.");
 const old=await allRecords();
 let count=0;
 for(const candidate of series.slice(-10)){
  const existing=old.find(x=>x.id===candidate.id);
  await withStore("readwrite",store=>store.put(existing?combineSession(existing,candidate):candidate));
  count++;
 }
 const all=await allRecords();
 const removable=all.sort((a,b)=>Date.parse(b.savedAt)-Date.parse(a.savedAt)).slice(12);
 for(const item of removable)await withStore("readwrite",store=>store.delete(item.id));
 return {savedSessions:count,totalStored:Math.min(all.length,12)};
}
export async function findSavedBars(ticker,publishedAt){
 const code=stockKey(ticker);
 if(!code)return null;
 const records=(await allRecords()).filter(x=>x.stockCode===code);
 const series=chooseArticleSeries(records,code,publishedAt);
 if(!series)return null;
 return {bars:series.bars,stockCode:series.stockCode,kstDate:series.kstDate,
  savedAt:series.savedAt,source:series.source};
}
export async function removeSavedBars(ticker){
 const code=stockKey(ticker);
 if(!code)throw Error("먼저 종목코드를 입력하세요.");
 const records=(await allRecords()).filter(x=>x.stockCode===code);
 for(const item of records)await withStore("readwrite",store=>store.delete(item.id));
 return records.length;
}
