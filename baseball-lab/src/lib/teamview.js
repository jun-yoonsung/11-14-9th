/* 팀 승률 추이와 예측 그래프 계산 (화면 components/TeamExtras.jsx, PDF report.js가 같이 쓴다)
 * team_forecast.json: history[팀] = [[시즌, 승, 패, 득점, 실점, 승률]], teams[팀] = { now, pred: [{h, year, wp, lo, hi, wins, method}] } */
import { plot } from "./chart.js";

export const TEAM_COLORS = ["#5e6ad2", "#d0312d", "#17734f", "#c9892b"];
export const TEAM_METHOD = { ExtraTrees: "머신러닝 모델", Ridge: "선형 모델", league: "리그 평균(.500)", last: "작년 승률", pyth: "득실 기반 기대 승률", avg3: "최근 3시즌 평균", shrunk: "최근 3시즌 가중 평균을 .500 쪽으로 당긴 값" };
export const wpText = v => (v == null ? "-" : v.toFixed(3).replace(/^0/, ""));

export function teamPlot(ids, names, tf, size = {}, fromYear = 2005) {
  const series = [], bands = [];
  ids.forEach((id, i) => {
    const hist = (tf.history[id] || []).filter(r => r[0] >= fromYear).map(r => ({ x: r[0], y: r[5], t: `${names[id] || id} ${r[0]} 승률 ${wpText(r[5])} (${r[1]}승 ${r[2]}패)` }));
    const pr = tf.teams[id];
    series.push({ name: names[id] || id, color: TEAM_COLORS[i % 4], width: 2, r: 2.6, pts: hist });
    if (pr) series.push({ name: (names[id] || id) + " 예측", color: TEAM_COLORS[i % 4], dash: "5 3", width: 2, hollow: true, r: 3.4, pts: [{ x: tf.meta.base_season, y: pr.now.wp }, ...pr.pred.map(q => ({ x: q.year, y: q.wp, t: `${names[id] || id} ${q.year} 예측 승률 ${wpText(q.wp)} (${wpText(q.lo)}~${wpText(q.hi)})` }))] });
  });
  return plot({ series, bands, yDigits: 3, xTickMax: 9, ...size });
}
