/** 
 * Candle price-action CLUES ONLY. No trade-side data in ka10080.
 * Distinguishes direction of closing vs opening from possible intrabar
 * selling pressure. NEVER calls a bullish candle an actual buy-side trade.
 */
export function candlePressure(bar){
 const o=Number(bar?.open),h=Number(bar?.high),l=Number(bar?.low),c=Number(bar?.close);
 if(![o,h,l,c].every(v=>Number.isFinite(v)&&v>0)||h<l||
    h<Math.max(o,c)||l>Math.min(o,c)||h===l){
  return {code:"UNKNOWN",label:"체결 방향 미확인",basis:"가격 범위가 없어 압력을 추정할 수 없습니다.",
    priceDirection:"UNKNOWN",observedTradeSide:false};
 }
 const range=h-l,position=(c-l)/range;
 const upper=(h-Math.max(o,c))/range;
 const lower=(Math.min(o,c)-l)/range;
 const priceDirection=c>o?"UP":c<o?"DOWN":"FLAT";
 let code="NEUTRAL",label="가격압력 중립·혼재",basis="봉 종가 위치만으로 매수·매도 체결 우위를 구분할 수 없습니다.";
 if(position<=.30){
   code="SELL_PRESSURE_CLUE";label="매도압력 추정";
   basis=upper>=.25?"윗꼬리가 있고 종가가 봉의 저가권에 있습니다.":"종가가 봉의 저가권에 있습니다.";
 }else if(position>=.70){
   code="BUY_PRESSURE_CLUE";label="매수압력 추정";
   basis=lower>=.25?"아랫꼬리가 있고 종가가 봉의 고가권에 있습니다.":"종가가 봉의 고가권에 있습니다.";
 }
 const direction=priceDirection==="UP"?"상승봉":priceDirection==="DOWN"?"하락봉":"보합봉";
 return {code,label,basis,priceDirection,observedTradeSide:false,
  position,upperWick:upper,lowerWick:lower,
  warning:direction+"의 색은 가격 변화만 의미합니다. 실제 매수·매도 체결 방향 및 체결량은 아직 수집하지 않았습니다."};
}
