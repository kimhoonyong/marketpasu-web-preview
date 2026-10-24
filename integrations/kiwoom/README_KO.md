# 키움 REST API → 마켓파수 1분봉 수집기 (PC 로컬)

기존 발급된 키움 REST 실전 인증정보 재사용을 목적으로 만든 읽기 전용 수집기입니다.
공식 ka10080 (POST /api/dostk/chart)로 한 KRX 종목의 1분봉을 조회하고, 마켓파수 화면에서 읽을 수 있는 CSV로 변환합니다.

## 실행
1. 기존 키움 PC 인증 프로그램의 토큰 또는 기존 REST 인증정보를 로컬 환경에 연결합니다. 새 발급이 아닙니다.
2. PC 명령창에서 아래 명령을 실행합니다.

    py -3 integrations\kiwoom\rest_minutes.py --ticker 005930 --date 2026-10-22 --mode real

3. 생성된 CSV 파일을 마켓파수 > 뉴스·수급 비교 > 분봉 CSV 파일에서 불러옵니다.

기본 경로: %LOCALAPPDATA%\MarketPasu\kiwoom_minutes\005930_YYYY-MM-DD_1m.csv

## 인증 연결
- KIWOOM_ACCESS_TOKEN 환경값: 이미 발급받은 유효한 실전 REST 토큰
- 또는 KIWOOM_APP_KEY와 KIWOOM_APP_SECRET 환경값: 기존 발급 키를 로컬 프로세스에만 연결해 OAuth 토큰 갱신
- 기존 Kiwoom Scout의 data\kiwoom_rest_credentials.bin은 독자적인 암호화 파일입니다. 현재 기존 인증 모듈에 접근할 수 없어 임의 해독하지 않습니다. 향후 이 인증 모듈에서 토큰을 공급하도록 연결하면 다시 입력할 필요가 없습니다.

중요: 앱키/시크릿/토큰을 채팅, GitHub, CSV나 웹페이지에 붙여넣지 마세요.

## 이 기능의 제한
- 1분봉 OHLC 및 거래량만 실제 API 응답으로 저장합니다. ka10080으로 확인하지 못한 거래대금 및 매수·매도 주도 체결량은 공백으로 둡니다.
- 한국 증권시장 KRX의 6자리 종목 하나, 거래일 하나, 최대 3페이지로 제한합니다. NXT/SOR 혼합 거래대금은 별도 검증 전까지 분석에 합치지 않습니다.
- API 오류 시 기존 로컬 CSV를 덮어쓰지 않습니다.
- 계좌·주문·잔고 조회, 거래명령, 원격 동기화, 키 저장, 텔레그램 발송을 하지 않습니다.
- 이번 단계는 PC 로컬 수집 후 CSV 화면 업로드까지입니다. 웹앱이 PC 인증 세션에 자동으로 접근할 수 있는 것은 아닙니다.

공식 자료: https://github.com/Kiwoom-Securities/Kiwoom-REST-API
키움 REST 가이드: https://openapi.kiwoom.com/intro/serviceInfo

## 다음 단계: 기존 Kiwoom Scout 인증환경 안전 진단
- PC에서 이 폴더에 있는 RUN_MARKETPASU_KIWOOM_CHECK.cmd를 더블클릭합니다.
- 출력은 기존 프로그램 및 파일의 **이름·존재 여부**만 확인합니다. 인증정보·토큰·계좌내역은 열거나 출력하지 않습니다.
- 기존 Kiwoom Scout Lite의 인증파일 후보: %LOCALAPPDATA%\KiwoomScoutLite\rest_credentials.dat (Windows DPAPI).
- 기존 ThemeManager의 인증파일 후보: ThemeManager\data\kiwoom_rest_credentials.bin. secure_credentials.py 및 rest_autostore.py 모듈이 있다면 재사용 연결 대상입니다.
- ThemeManager 실행기 run_kiwoom_rest_collector.bat와 RUN_THEMEMANAGER.bat도 이름만 확인합니다.
- 점검 결과 PREFLIGHT_ONLY_NOT_LIVE_AUTHENTICATION은 인증 성공을 뜻하지 않습니다.
- 직접 로컬 경로를 알려야 할 때는 KIWOOM_SCOUT_ROOT 또는 KIWOOM_THEME_ROOT 환경변수로 추가할 수 있습니다.
- 이 작업만으로 기존 인증모듈 호출을 추측해 실행하거나 개인키를 복호화하지 않습니다.

## 키움 실시간 0B 체결 참고자료 (실제 수신 기록이 있을 때)
- 공식 주식체결 타입 0B FID: 20 체결시간, 10 현재가, 15 거래량, 1315 매도체결량_단건, 1316 매수체결량_단건, 1030/1031 기타 체결량 필드.
- 과거의 Kiwoom NXT Live Probe 로그 등 0B REAL JSONL이 있으면 로컬에서 다음 명령을 실행합니다.
    py -3 realtime_0b_observe.py --input "C:\경로\실제_0B로그.jsonl" --ticker 005930
- 로그에 메시지 수신일이 없다면 --date YYYY-MM-DD를 지정할 수 있지만 날짜는 미검증으로 기록됩니다.
- 생성되는 두 파일은 _TICK_OBSERVED.csv와 _MINUTE_OBSERVED_ONLY.csv입니다.
- 이 파일은 실제 체결을 **포착한 일부 표본**일 수 있습니다. 누락·중복/재접속 가능성이 있어 시장 전체 분당 거래량·거래대금이나 투자자 순매수가 아닙니다.
- 그래서 완전한 OHLC 1분봉으로 위장하지 않았고 마켓파수 분봉 분석 화면에도 그대로 투입되지 않도록 다른 열 형식으로 만들었습니다.
- 키움 REST 0B WebSocket 신규 실시간 수신 연결 및 기존 Scout 자격정보 재사용은 PC 진단/실전 수신검증 이후에만 연결합니다.
- 사용자가 기존 프로그램 파일을 삭제하거나 다른 Windows 계정으로 인증정보를 옮길 필요는 없습니다.

참고: 키움 공식 실시간 0B 예제 https://github.com/Kiwoom-Securities/Kiwoom-REST-API/blob/main/examples/국내주식/실시간시세/subscribe_domestic_stock_trade_async.py

## 일봉(ka10081)으로 뉴스 2~12주 전 지지·반등 흔적 확인
- 키움 공식 ka10081 (POST /api/dostk/chart)는 수정주가 옵션과 일자별 시가·고가·저가·종가·거래량·거래대금을 제공합니다.
- 기존 PC의 Kiwoom REST 인증정보를 활용한 수집 파일: integrations/kiwoom/rest_daily.py.
- 실행 예: py -3 integrations\kiwoom\rest_daily.py --ticker 005930 --date 2026-10-22 --mode real
- 기본 생성 파일: %LOCALAPPDATA%\MarketPasu\kiwoom_minutes\005930_2026-10-22_DAILY.csv.
- 마켓파수의 뉴스·수급 비교 > 일봉 20~60거래일 분석에서 CSV를 불러와 분석합니다. 브라우저 안에서만 분석하며 서버 전송은 하지 않습니다.
- 입력 일봉은 거래일 최소 25개, 최근 최대 60개를 사용합니다. **뉴스가 나온 날짜와 이후 일봉은 무조건 제외**하므로 향후 가격정보를 이용한 가짜 '예측'이 생기지 않도록 했습니다.
- 먼저 오래된 약 55% 거래일로 가격대를 산정하고, 나중 약 45% 거래일에서 같은 가격대의 반복 재접근과 그 후 반등(최대 4거래일)을 별도로 검증합니다. 이는 연구 초기 임계값이며 과최적화·오탐 검증이 필요합니다.
- 분봉 분석은 뉴스 시점 전후의 단기 변동, 일봉 분석은 며칠/몇 주 동안의 매물대·반등 패턴을 담당합니다.
- 일봉만으로 매수 주체 또는 특정 '세력'이 누군지 식별하거나 미공개정보를 알았다고 확정할 수 없습니다.
- 키움 수정주가 조회(1)는 요청하지만 과거 권리락·액면분할에 대한 연속성을 사용자가 확인하지 않았다면 판단은 보류됩니다.
- 원문 최초 보도시각을 확인하지 않았다면 ‘뉴스 최초 공개시각 미확인’ 상태로 표시하며, 보도 사전 인지로 해석하지 않습니다.
- 키움 거래대금 필드 trde_prica의 화폐 단위·시장범위는 별도 확인해야 하며 일봉 안에서는 상대적인 거래대금 증가 배율 위주로 사용합니다.
- PC의 기존 API 인증 세션이 아직 이 대화에서 실전 검증되지 않았으므로, 실제 분봉/일봉의 라이브 다운로드 성공이라고 보고하지 않습니다.

키움 공식 ka10081 예제: https://github.com/Kiwoom-Securities/Kiwoom-REST-API/blob/main/examples/국내주식/차트/get_domestic_stock_daily_chart.py

## 종목명 검색 → 일봉·분봉 자동 차트 (PC 첫 연결)

사용자 요청대로 CSV를 매번 복사·붙여넣지 않고 종목명으로 조회하는 기능을 추가했습니다.

1. Windows PC에서 기존 **키움 REST API 인증을 사용하도록 설정된 로컬 환경**에서 `RUN_MARKETPASU_AUTO_CHARTS.cmd`를 더블클릭합니다.
2. PC에서 `https://kimhoonyong.github.io/marketpasu-web-preview/market/`를 엽니다.
3. "종목명으로 바로 보는 일봉·분봉"에서 "삼성전자", "명신산업" 등 **종목명**을 입력하고 검색 결과를 선택합니다.
4. 동일 종목의 일봉 `ka10081`과 기준일의 분봉 `ka10080`을 로컬 키움 REST 조회 서비스가 가져옵니다. **CSV 필요 없음**.
5. 차트: 마우스 휠 또는 스마트폰 제스처로 확대·축소, 드래그로 좌우 이동, 전체 보기, 크게 보기.

종목 검색은 키움 공식 `ka10099`의 코스피·코스닥 종목 목록을 사용합니다. 영문/한글 이름의 일부를 입력해도 검색할 수 있습니다. 종목코드 기억 불필요.

**로컬 연결과 기존 암호화 인증 파일 주의:**
- 본 로컬 서비스는 개인 PC의 `127.0.0.1:8765`에만 바인딩되며 `https://kimhoonyong.github.io` 출처의 읽기 요청만 받습니다. POST 주문 및 계좌 API는 없습니다.
- 토큰·키/시크릿은 서버의 로컬 환경변수를 이용하며 브라우저에 보내지 않습니다. 기존 Scout 암호화 파일은 직접 읽거나 복호화하지 않습니다.
- **기존 Kiwoom Scout REST 인증이 이미 활성화돼 있더라도 이 스크립트의 로컬 환경변수가 설정되지 않았다면 자동으로 사용할 수 없습니다.** 그 경우 기존 PC의 인증 모듈에서 토큰을 로컬로 전달하도록 별도 연결이 필요합니다. 절대로 키를 웹페이지·채팅·공개 GitHub에 붙여넣지 마세요.
- 웹브라우저에서 로컬 네트워크 접근 권한을 물으면 허용해야 PC 로컬 서버에 접속할 수 있습니다. 회사 PC 보안정책에 따라 차단될 수 있습니다.
- **휴대폰에서는 PC의 localhost를 볼 수 없습니다.** 휴대폰 자동 시세조회는 안전한 사용자 인증·중계 서버를 추가로 구축하기 전까지 미지원입니다. 휴대폰에서도 기존 뉴스 웹사이트는 정상 제공됩니다.
- 뉴스·시세·차트는 키움 이용약관 및 시세 재배포 정책을 준수해야 합니다. 개인 PC 로컬 조회이며 공개 GitHub 데이터로 원문 분봉/일봉을 자동 게시하지 않습니다.
- 장 휴장일에는 1분봉이 없을 수 있으므로 최근 평일을 기본 선택하고, 한국 공휴일 등 실제 거래일은 직접 확인할 수 있습니다.
- 차트 표시 성공은 매집/시세조종 검증이 아닙니다. 실제 투자주체, 공시, 뉴스 최초 발행시각 비교는 별도 검증입니다.

파일: `marketpasu_local_chart_server.py`, `RUN_MARKETPASU_AUTO_CHARTS.cmd`, `rest_minutes.py`, `rest_daily.py`.
기존 뉴스·수급 비교 CSV 입력은 **고급 분석의 선택사항**으로 유지합니다.

## 2026-10-24: 기존 D:\ThemeManager 인증파일 자동 재사용

PC 점검 결과 `D:\ThemeManager\secure_credentials.py`와 `data\kiwoom_rest_credentials.bin`이 확인되었습니다.
기존 `load_credentials(path)` 함수의 사용 규격이 확인됐으므로, 이제 로컬 차트 서버는 다음 순서로 인증합니다.

1. 기존 로컬 환경변수 KIWOOM_APP_KEY/KIWOOM_APP_SECRET 또는 KIWOOM_ACCESS_TOKEN이 설정돼 있다면 우선 이용합니다.
2. 없으면 `D:\ThemeManager\secure_credentials.py`를 이 Windows 계정에서 불러와 `load_credentials(D:\ThemeManager\data\kiwoom_rest_credentials.bin)`을 **서버 메모리에서만 실행**합니다.
3. 반환된 딕셔너리에 REST App Key와 Secret이 담긴 일반적인 키 이름이 있으면 기존 키움 OAuth로 토큰을 발급받습니다. 토큰은 서버 프로세스 메모리에서만 최대 12시간 보관합니다.
4. 모듈을 찾을 수 없거나 암호 해제에 실패하거나 반환 형식을 이해하지 못하면 실패 상태 코드만 보여줍니다. 키·Secret·토큰 내용, 인증파일 내용, 예외 메시지는 출력·업로드하지 않습니다.
5. 기존 인증모듈 또는 인증파일의 **수정·삭제·복사·GitHub 전송은 전혀 하지 않습니다.** 기존 프로그램의 암호화 방식을 바꾸지도 않습니다.

**연결 점검 시나리오:** 기존 검은색 `127.0.0.1:8765` 창을 먼저 닫고, **새 버전**의 실행 파일을 사용하세요. 이전 실행기는 예전 커밋을 내려받으므로 현재 인증 연결 기능이 포함되지 않습니다.

- 검은색 창에 `KIWOOM_AUTH: READY_TO_VERIFY`가 나오면 인증 형식이 읽혔다는 뜻입니다. **실제 로그인 성공이 아닙니다.**
- `KIWOOM_AUTH_SOURCE_STATUS: SCOUT_CREDENTIALS_READY`는 기존 ThemeManager 인증함수 연동에 성공했다는 뜻입니다.
- `KIWOOM_AUTH_SOURCE_STATUS: EXISTING_AUTH_FORMAT_UNSUPPORTED`는 기존 함수의 반환 딕셔너리 구조가 현재 연결 코드와 다르다는 뜻입니다. App Key 값은 공유하지 말고 **상태 코드만** 알려주세요.
- `KIWOOM_AUTH_SOURCE_STATUS: EXISTING_AUTH_LOAD_FAILED`는 인증파일/모듈 실행·복호화가 실패했다는 뜻입니다. 동일 Windows 계정인지와 기존 ThemeManager 실행 가능 여부부터 확인합니다.
- `KIWOOM_AUTH: NOT_CONFIGURED`이면 키를 새로 발급받지 말고 로컬 연결 상태를 점검합니다.
- 이후 PC 브라우저 마켓파수에서 **삼성전자**를 검색해 선택하고, 실제 키움 종목명 목록 및 일봉/1분봉의 응답이 나오는지 확인합니다. 성공 전까지는 실전 데이터 수신이라고 주장하지 않습니다.

환경변수 `MARKETPASU_THEME_ROOT`로 루트 폴더를 변경할 수 있지만, 기본은 확인된 `D:\ThemeManager`입니다.
공개 GitHub에 있는 코드는 암호화 파일 자체와 그 비밀값에 접근하지 못합니다. 사용자 PC에서 기존 프로그램의 인증 모듈을 호출할 때만 복호화가 진행됩니다.

개인 PC의 읽기 전용 데이터 API 연결이며, 휴대폰 원격 중계·주문·계좌 연동은 추가하지 않았습니다.
