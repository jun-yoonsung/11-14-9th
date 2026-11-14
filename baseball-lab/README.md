# 야구 분석 랩 (첫 버전)

PRD.md, ACCEPTANCE.md, storyboard.html 기준으로 만든 야구 데이터 분석 사이트입니다.

## 데이터 만들기 (처음 한 번)
이 사이트는 실제 KBO 2026 정규시즌 기록을 사용합니다. 요약 CSV는 `data/`에 들어 있고, 원본 CSV는 저장소 맨 위 `kbo_2026_data/`에 있습니다. 원본이 바뀌면 아래 명령으로 요약 CSV를 다시 만드세요.

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
- `data/` 만들어진 요약 CSV와 meta.json (GitHub에도 함께 올려 둠)
- `js/core.js` 체험 로그인, 분석 기록 저장(브라우저), CSV 읽기
- `js/stats.js` 지표 계산과 리그 내 위치(백분위)
- `js/report.js` PDF 보고서 디자인과 파일 생성

## 첫 버전 범위
- 로그인은 버튼만 누르면 되는 체험 로그인, 회원가입은 화면만 있음
- 영상 분석과 데이터 업로드는 "다음 버전" 안내만 표시
- 분석 기록은 이 브라우저(localStorage)에만 저장
