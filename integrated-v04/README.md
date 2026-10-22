# 마켓파수 v0.4 — 실제 뉴스 표시 계약 준비(오프라인)

## 현재 단계

v0.3까지 휴대폰에서 독립 Firebase 인증·승인 회원의 `trialNews` 1건 조회가 검증되었습니다.
v0.4의 이번 작업은 **운영 데이터베이스 연결이나 실제 뉴스 공개가 아니라**, 기존
`stocknewsmonitor-automation` 저장소의 `app/index.js`에 정의된
`newsCandidatesV21` 필드를 읽기 전용 화면 모델로 변환하는 **순수 함수 계약**입니다.

- 원본: `newsCandidatesV21` 후보의 title, source, publishedAt, seenCount,
  firstSeenAt, lastSeenAt, publisherCheckStatus, publisherReviewRequired,
  publisherMissingCount, publisherTitleChangeCount
- 화면용 화이트리스트: id, title, publisher, firstPublished,
  firstCollected, lastSeen, observations, status, statusLabel
- 분류: 제목 변경 **의심** / 발행처 **확인 필요** / **재관측** / 미판정
- 발행처 확인 실패는 **삭제 확정**이 아니며, 관측 횟수는 **재탕 확정**이 아닙니다.
- 한 번에 화면으로 전달할 최대 문서 수: 10개.
- 데이터 변환만으로 접근권한이 생기는 것은 아닙니다.

## 보안 경계와 다음 작업

1. 현재 `integrated-v03/`와 `marketpasu-auth-trial`은 변경하지 않습니다.
2. 공개 GitHub Pages 브라우저에서 운영 `newsCandidatesV21`에 직접 접속하지 않습니다.
3. 실제 연동 전에는 **서버측 인증토큰 검증, 승인회원 확인, 조회범위 제한,
   10건 이하 페이지네이션, 호출 빈도 제한, 사용자별 접근 정책, 비용 보호**가 필요합니다.
4. 시험 Firebase와 운영 Firebase는 별도 프로젝트이므로 시험 Firebase 사용자 UID나
   토큰이 운영 Firebase에서 자동으로 승인되는 것으로 취급하면 안 됩니다.
5. 검증된 서버가 최소 필드만 내보내는 읽기 전용 엔드포인트 또는 별도의
   승인된 비식별·최소 필드 복제본을 통해 연동합니다.
6. 신규 클라우드 리소스, 서비스 계정 권한, 쓰기 권한, 자동수집,
   Gemini/텔레그램 호출, 과금 한도 변경은 이번 작업에 포함하지 않습니다.

## 오프라인 검증

Node 22 이상에서:

```bash
node --test integrated-v04/news-contract.test.mjs
```

테스트는 네트워크, Firebase 연결, 자격증명 및 실제 기사 내용을 사용하지 않습니다.
