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
