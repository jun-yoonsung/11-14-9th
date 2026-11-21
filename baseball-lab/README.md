# 야구 분석 랩 (React + Tailwind)

실제 KBO 2026 정규시즌 기록으로 타자·투수·팀을 분석하는 사이트입니다. 프론트엔드는 **React(Vite) + Tailwind CSS v4**이고, 서버 없이 브라우저에서 CSV를 읽어 계산합니다.

## 실행 방법
```
cd baseball-lab
npm install          # 처음 한 번
npm run dev          # 개발 서버 (http://localhost:5173)
npm run build        # 배포용 파일을 dist/ 에 만듦
npm run preview      # 만든 dist/ 를 미리 보기
```
- Node.js 20 이상이 필요합니다.
- 화면 주소는 `#/rank`처럼 `#` 뒤에 붙습니다. (HashRouter라서 GitHub Pages에서도 새로고침이 됩니다)
- main에 push하면 `.github/workflows/pages.yml`이 자동으로 빌드해 GitHub Pages에 올립니다. 저장소 Settings → Pages의 Source는 **GitHub Actions**여야 합니다.

## 데이터 만들기 (처음 한 번)
이 사이트는 실제 KBO 2026 정규시즌 기록을 사용합니다. 원본 CSV는 용량이 크고 저장소에 올리지 않아서, 내 컴퓨터에서 요약 CSV를 만들어야 합니다.

```
pip install pandas
cd baseball-lab
python3 build_data.py ~/Downloads/kbo_2026_data
```
원본 폴더 안에는 `kbo_games/`(batting.csv, pitching.csv)와 `kbo_pitches/`(월별 투구 CSV)가 있어야 합니다. 실행하면 `public/data/` 폴더에 요약 CSV가 생깁니다.

- 정규시즌(kbo_r) 720경기만 사용합니다.
- 타수·안타·홈런·볼넷·삼진·타점·득점과 투수 기록은 경기별 기록 기준입니다.
- 2루타·3루타·사구·희생플라이는 투구별 기록의 타석 결과에서 세어서 공식 기록과 소폭 다를 수 있습니다.
- 규정타석은 144경기 × 3.1 = 446타석, 규정이닝은 144이닝입니다.
- 원본에 없는 도루와 투수 승·패·세이브는 지표에서 뺐습니다.

## 구성
- `src/pages/` 화면(Home, Login, Signup, Analyze, Result, History, Rank, Guide)
- `src/components/` 공통 부품(Layout, Scene 배경, PctBlock, PlayerCombo 선수 검색, DetailReport 상세 보고서)
- `src/context/` 로그인·배경 장면·알림 상태
- `src/lib/` 계산과 데이터: `stats.js` 지표 계산, `detail.js` 상세 보고서 데이터, `rank.js` 순위·군집, `report.js` PDF, `api.js` CSV 읽기, `storage.js` 브라우저 저장·로그인 표시, `cloud.js` Firebase, `sceneSvg.js` 배경 그림
- `src/config.js` Firebase 연결 값, `src/index.css` Tailwind 테마와 스타일
- `public/data/` 요약 CSV와 meta.json, `public/` 안의 manifest·sw.js·icons는 웹앱(PWA) 파일
- `build_data.py` 원본 CSV를 요약 CSV로 바꾸는 스크립트, `tools/upload_firestore.py`, `firestore.rules`

## 선수 순위와 지표 설명 (누구나 볼 수 있음)
- `#/rank`: 투수·타자 순위 표(열 이름을 눌러 정렬), 팀·규정·보직·최소 기준 필터, 유형 버튼, K-평균 자동 군집
- `#/guide`: 지표 뜻과 계산식, 존 안·밖과 스윙 정의
- 선구안 지표(컨택%, Chase%, 헛스윙 유도%)는 `build_data.py`가 투구별 기록에서 세어 CSV에 넣습니다. 데이터를 바꾸면 `build_data.py`를 다시 실행하세요.

## 실제 로그인과 DB 켜기 (선택)
기본 상태는 체험 로그인 + `data/` 폴더 CSV입니다. Firebase를 연결하면 이메일·Google 로그인, 계정별 분석 기록, DB에서 CSV 읽기가 켜집니다.

1. Firebase 콘솔에서 프로젝트를 만들고 Authentication(이메일/비밀번호, Google)과 Firestore를 켭니다.
2. 프로젝트 설정의 `firebaseConfig` 값을 `src/config.js`의 `firebase`에 붙여 넣습니다. (공개 식별값이라 비밀이 아닙니다)
3. Firestore 규칙에 `firestore.rules` 내용을 붙여 넣습니다. (KBO 데이터는 누구나 읽기, 분석 기록은 본인만, 공유한(공개) 분석 `shared`는 누구나 읽기·만든 사람만 쓰기). 분석 공유(공개/비공개)는 이 연결이 있어야 다른 사람에게 보입니다.
4. 서비스 계정 키(비밀 파일)를 받아 CSV를 올립니다. 키 파일은 GitHub에 올리지 마세요.
```
pip install firebase-admin
python3 tools/upload_firestore.py ~/keys/service-account.json
```
5. Authentication 설정의 "승인된 도메인"에 사이트 주소(jun-yoonsung.github.io)를 추가합니다.

## 첫 버전 범위 (이후 버전에서 늘어난 내용은 PRD.md 참고)
- 로그인은 버튼만 누르면 되는 체험 로그인, 회원가입은 화면만 있음
- 영상 분석과 데이터 업로드는 "다음 버전" 안내만 표시
- 분석 기록은 이 브라우저(localStorage)에만 저장
