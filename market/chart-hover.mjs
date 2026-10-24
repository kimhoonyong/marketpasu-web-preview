import {barAnalytics,compactWon} from "./bar-analytics.mjs";
import {formatNumber} from "./chart-model.mjs";

/** Match the three plotted panels in candle-chart.mjs; no fake values. */
export function panelAt(y,height){
 if(!Number.isFinite(y)||!Number.isFinite(height)||height<=0)return null;
 const priceBottom=Math.round(height*.59);
 if(y>=20&&y<=priceBottom)return "price";
 const volumeTop=priceBottom+21;
 const volumeBottom=Math.round(height*.77);
 const moneyTop=volumeBottom+14;
 const moneyBottom=height-33;
 if(y>=volumeTop && y<=volumeBottom)return "volume";
 if(y>=moneyTop && y<=moneyBottom)return "turnover";
 return null;
}
export function hoveredBarIndex(x,width,range,{left=68,right=75}={}){
 if(!Number.isFinite(x)||!Number.isFinite(width)||!range||
    !Number.isInteger(range.count)||range.count<1||!Number.isInteger(range.start))return null;
 const plotWidth=width-left-right;
 if(plotWidth<=0||x<left||x>width-right)return null;
 const bar=Math.max(0,Math.min(range.count-1,
   Math.floor((x-left)/plotWidth*range.count)));
 return range.start+bar;
}
export function describeBarHover(bar,kind,panel){
 if(!bar||!["price","volume","turnover"].includes(panel))return null;
 const time=String(bar.date||bar.time||"").replace("T"," ").slice(0,kind==="daily"?10:16);
 const a=barAnalytics(bar,{kind});
 const partial=bar.partial===true?" · 1분봉 일부 누락 가능":"";
 if(panel==="price"){
   // Keep the hover free of interpretation: exactly the OHLC numbers.
   return {time,heading:"가격봉 OHLC",
     value:formatNumber(bar.close)+"원",note:"",
     ohlc:{
       "시가":formatNumber(bar.open)+"원",
       "고가":formatNumber(bar.high)+"원",
       "종가":formatNumber(bar.close)+"원",
       "저가":formatNumber(bar.low)+"원"
     }};
 }
 if(panel==="volume"){
  return {time,heading:"거래량",value:
    (a.volume===null?"미제공":formatNumber(a.volume)+"주"),
    note:"선택한 "+(kind==="daily"?"일봉":"분봉")+"의 거래량"+partial};
 }
 if(kind==="daily"){
  if(a.turnoverWon===null)return {time,heading:"거래대금",value:"실제 거래대금 미제공",
    note:"키움 제공 일봉 거래대금이 확인되지 않았습니다."};
  return {time,heading:"거래대금 · 키움 일봉 제공",
    value:a.turnoverWon.toLocaleString("ko-KR",{maximumFractionDigits:0})+"원",
    note:compactWon(a.turnoverWon)+" · 제공 데이터의 백만원 단위를 원으로 환산"};
 }
 if(a.estimatedValueWon===null)return {time,heading:"거래대금 · 추정치",value:"추정 불가",
   note:"키움 1분봉에는 실제 거래대금 정보가 없습니다."};
 return {time,heading:"거래대금 · 추정치",
  value:a.estimatedValueWon.toLocaleString("ko-KR",{maximumFractionDigits:0})+"원",
  note:compactWon(a.estimatedValueWon)+" · 종가×거래량, 실제 체결대금 아님"+partial};
}
