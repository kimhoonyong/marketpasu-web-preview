/**
 * Deliberately small, conservative issuer-name hints.
 * The RSS topic is NOT evidence that the mentioned issuer is the news subject.
 * A hint must be confirmed by the reader before a price series is assessed.
 */
const ISSUERS=[
 {code:"005930",name:"삼성전자",terms:["삼성전자"]},
 {code:"000660",name:"SK하이닉스",terms:["SK하이닉스","SK하닉","하이닉스"]},
 {code:"009900",name:"명신산업",terms:["명신산업"]},
 {code:"005380",name:"현대차",terms:["현대차","현대자동차"]},
 {code:"066570",name:"LG전자",terms:["LG전자"]},
 {code:"035420",name:"NAVER",terms:["NAVER","네이버"]},
 {code:"TSLA",name:"테슬라",terms:["테슬라","TESLA"]},
 {code:"NVDA",name:"엔비디아",terms:["엔비디아","NVIDIA"]}
];
const GENERIC_NAVER=/(네이버페이|네이버\s*블로그|네이버\s*프리미엄(?:콘텐츠)?|네이버\s*카페)/i;
const HYUNDAI_SECURITIES=/현대차증권|현대자동차증권/i;
function normalize(s){return String(s||"").normalize("NFKC").toLowerCase();}
function hasTerm(title,term){
 const hay=normalize(title),needle=normalize(term);
 let at=hay.indexOf(needle);
 while(at>=0){
  const pre=at?hay[at-1]:"",post=hay[at+needle.length]||"";
  // Avoid matching NAVER inside "naverpay", and longer unrelated English tickers.
  const ascii=/^[a-z0-9]+$/.test(needle);
  if(!ascii||(!/[a-z0-9]/.test(pre)&&!/[a-z0-9]/.test(post)))return true;
  at=hay.indexOf(needle,at+1);
 }
 return false;
}
export function suggestStockFromTitle(title){
 const t=String(title||"");
 if(!t.trim())return {status:"none",candidates:[],reason:"기사 제목이 비어 있습니다."};
 const candidates=ISSUERS.filter(issuer=>{
  if(issuer.code==="035420"&&GENERIC_NAVER.test(t))return false;
  if(issuer.code==="005380"&&HYUNDAI_SECURITIES.test(t)&&!t.includes("현대차·"))return false;
  return issuer.terms.some(term=>hasTerm(t,term));
 }).map(({code,name})=>({code,name}));
 if(candidates.length===1)return {status:"suggested",candidates,reason:"기사 제목의 기업명 일치에 따른 후보입니다. 실제 종목과 원문을 확인하세요."};
 if(candidates.length>1)return {status:"ambiguous",candidates,reason:"복수 종목이 언급되어 자동 선택하지 않습니다."};
 return {status:"none",candidates,reason:"제목에서 명확한 종목을 찾지 못했습니다. 직접 확인 후 입력하세요."};
}
export function stockKey(value){
 const input=String(value||"").trim().replace(/^A(?=\d{6}$)/i,"").toUpperCase();
 if(/^\d{1,6}$/.test(input))return input.padStart(6,"0");
 if(/^[A-Z]{1,5}$/.test(input))return input;
 return "";
}
