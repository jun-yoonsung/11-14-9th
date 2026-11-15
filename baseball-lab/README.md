# 야구 분석 랩 (첫 버전)

PRD.md, ACCEPTANCE.md, storyboard.html 기준으로 만든 야구 데이터 분석 사이트입니다.

## 데이터 만들기 (처음 한 번)
이 사이트는 실제 KBO 2026 정규시즌 기록을 사용합니다. 원본 CSV는 용량이 크고 저장소에 올리지 않아서, 내 컴퓨터에서 요약 CSV를 만들어야 합니다.

```
pip install pandas
cd baseball-lab
python3 build_data.py ~/Downloads/kbo_2026_data
```
원본 폴더 안에는 `kbo_games/`(batting.csv, pitching.csv)와 `kbo_pitches/`(월별 투구 CSV)가 있어야 합니다. 실행하면 `data/` 폴더에 요약 CSV가 생깁니다.

- 정규시즌(kbo_r) 720경기만 사용합니다.
- 타수·안타·홈런·볼넷·삼진·타점·득점과 투수 기록은 경기별 기록 기준입니다.
- 2루타·3루타·사구·희생플라이는 투구별 기록의 타석 결과에서 세어서 공식 기록과 소폭 다를 수 있습니다.
- 규정타석은 144경기 × 3.1 = 446타석, 규정이닝은 144이닝입니다.
- 원본에 없는 도루와 투수 승·패·세이브는 지표에서 뺐습니다.

## 실행 방법
CSV를 읽어야 해서 파일을 더블클릭하지 말고 로컬 서버로 여세요.

```
cd baseball-lab
python3 -m http.server 8000
```
브라우저에서 http://localhost:8000 을 엽니다. (PDF 저장 도구는 인터넷 주소에서 불러오므로 인터넷 연결이 필요합니다.)

## 구성
- `build_data.py` 원본 CSV를 요약 CSV로 바꾸는 스크립트
- `data/` 만들어진 요약 CSV와 meta.json (GitHub에는 올리지 않음)
- `js/core.js` 체험 로그인, 분석 기록 저장(브라우저), CSV 읽기
- `js/stats.js` 지표 계산과 리그 내 위치(백분위)
- `js/report.js` PDF 보고서 디자인과 파일 생성
- `js/rank.js` `js/guide.js` 선수 순위(유형·군집), 지표 설명
- `js/config.js` `js/cloud.js` Firebase 연결(로그인, 기록 저장, DB에서 CSV 읽기)
- `tools/upload_firestore.py` `firestore.rules` CSV를 Firestore에 올리는 스크립트, 보안 규칙

## 선수 순위와 지표 설명 (누구나 볼 수 있음)
- `rank.html`: 투수·타자 순위 표(열 이름을 눌러 정렬), 팀·규정·보직·최소 기준 필터, 유형 버튼, K-평균 자동 군집
- `guide.html`: 지표 뜻과 계산식, 존 안·밖과 스윙 정의
- 선구안 지표(컨택%, Chase%, 헛스윙 유도%)는 `build_data.py`가 투구별 기록에서 세어 CSV에 넣습니다. 데이터를 바꾸면 `build_data.py`를 다시 실행하세요.

## 실제 로그인과 DB 켜기 (선택)
기본 상태는 체험 로그인 + `data/` 폴더 CSV입니다. Firebase를 연결하면 이메일·Google 로그인, 계정별 분석 기록, DB에서 CSV 읽기가 켜집니다.

1. Firebase 콘솔에서 프로젝트를 만들고 Authentication(이메일/비밀번호, Google)과 Firestore를 켭니다.
2. 프로젝트 설정의 `firebaseConfig` 값을 `js/config.js`의 `firebase`에 붙여 넣습니다. (공개 식별값이라 비밀이 아닙니다)
3. Firestore 규칙에 `firestore.rules` 내용을 붙여 넣습니다. (KBO 데이터는 누구나 읽기, 분석 기록은 본인만)
4. 서비스 계정 키(비밀 파일)를 받아 CSV를 올립니다. 키 파일은 GitHub에 올리지 마세요.
```
pip install firebase-admin
python3 tools/upload_firestore.py ~/keys/service-account.json
```
5. Authentication 설정의 "승인된 도메인"에 사이트 주소(jun-yoonsung.github.io)를 추가합니다.

## 첫 버전 범위
- 로그인은 버튼만 누르면 되는 체험 로그인, 회원가입은 화면만 있음
- 영상 분석과 데이터 업로드는 "다음 버전" 안내만 표시
- 분석 기록은 이 브라우저(localStorage)에만 저장
