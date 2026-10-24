/**
 * Conservative stock-market headline relevance, not a truth/financial-advice model.
 * This avoids matching Google News RSS topics as if the article were about the
 * requested company: "NAVER" often returns unrelated Naver Blog material.
 * Company market capitalization cannot be verified from a headline; we prefer
 * a tracked-issuer and broad-market focus rather than calling small caps "junk".
 */
const BAD_PUBLISHER=/(?:^|\b)(?:naver blog|tistory|brunch(?:story)?)(?:$|\b)|네이버\s*(?:블로그|카페|프리미엄콘텐츠)|브런치|티스토리/i;
const NON_INVESTMENT=/(?:네이버\s*블로그|학교|초등학생|유아교육|가족체험|북\s*페스티벌|도서관|축제|공모전|한국PR대상|시승기|차량\s*시승|추도식|여심\s*잡기|게임\s*시나리오|메이킹\s*영상)/i;
const TRACKED_COMPANIES=/(삼성전자|sk\s*하이닉스|하이닉스|솔리다임|명신산업|현대차|현대자동차|lg\s*전자|테슬라|tesla\b|엔비디아|nvidia\b|naver\b|네이버(?!\s*(?:블로그|카페|페이|프리미엄)))/i;
const MATERIAL=/(실적|매출|영업이익|영업률|순이익|가이던스|어닝|흑자|적자|상장|ipo\b|주가|주주|자사주|배당|공모|증자|감자|수익성|현금흐름|인수|합병|매각|투자|지분|공급|수주|납품|계약|공장|양산|생산|증설|감산|출하|판매량|마진|관세|규제|수출|시장점유율|증권사|목표가|주식|adr\b|etf\b|반도체|hbm\b|공급망|데이터센터|전기차|전망|철회|검토\s*중단)/i;
const MARKET=(/코스피|코스닥|국내\s*증시|한국\s*증시|주식시장|국장|미장|증시|원[\/·-]달러|달러[\/·-]원|환율|금리|외국인\s*(?:순매수|순매도|매수|매도|자금)|원화\s*(?:강세|약세)/i);
const MARKET_ACTION=/(상승|하락|급락|급등|반등|마감|전환|폭락|회복|시장|지수|증시|주가|환율|달러|금리|매수|매도|투자|수급|거래|상폐|상장폐지|유동성|수익률|거래대금|약세|강세|전망|외국인|버블)/i;
const PENNY_SPOT=/(^\s*\[특징주\].*(?:상장\s*첫날|강세|급등)|코스닥\s*입성\s*\d+\s*년|정리매매\s*시작)/i;
export function marketRelevant(article){
  const title=String(article?.title||"");
  const publisher=String(article?.publisher||"");
  if(!title||BAD_PUBLISHER.test(publisher)||NON_INVESTMENT.test(title))return false;
  const tracked=TRACKED_COMPANIES.test(title);
  if(tracked&&MATERIAL.test(title))return true;
  if(PENNY_SPOT.test(title))return false;
  // Title content is authoritative here; a matched Google RSS query is not.
  return MARKET.test(title)&&MARKET_ACTION.test(title);
}
export function marketRelevanceScore(article){
  if(!marketRelevant(article))return -1;
  const title=String(article.title||"");
  const issuer=TRACKED_COMPANIES.test(title);
  const urgency=/(?:실적|영업이익|주가|주주|배당|ipo\b|철회|매각|수주|계약|증설|급등|급락|투자|상장|가이던스|금리|환율|매집)/i.test(title);
  return (issuer?3:1)+(urgency?2:0);
}
export function focusedMarketStories(rows){
  return (Array.isArray(rows)?rows:[]).filter(marketRelevant);
}
/**
 * High-confidence editorial/event anchor to group divergent headlines.
 * Reports remain independently linked; not a claim of copying/reposting.
 */
export function highConfidenceEventKey(article){
  const title=String(article?.title||"").replace(/\s+/g," ");
  if(/솔리다임/i.test(title)&&/(상장|ipo\b)/i.test(title)&&
     /(철회|중단|접었|접은|접어|포기)/i.test(title)){
    return "skhynix-solidigm-ipo-withdrawal";
  }
  return "";
}
