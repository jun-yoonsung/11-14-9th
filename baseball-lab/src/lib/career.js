/* 커리어(시즌별 기록)와 예측을 한 그래프로 묶는 계산. 화면(components/Career.jsx)과 PDF(report.js)가 같이 쓴다.
 * 행 모양: 타자 [시즌, 나이, 팀, 경기, 타석, 타율, 출루율, 장타율, OPS, 홈런] / 투수 [시즌, 나이, 팀, 경기, 이닝, ERA, WHIP, K/9, 승, 패, 세이브] */
import { plot } from "./chart.js";

export const CAREER = {
  batter: { stat: "OPS", vol: 4, main: 8, minShow: 50, peakMin: 200, volName: "타석", digits: 3, better: "high" },
  pitcher: { stat: "ERA", vol: 4, main: 5, minShow: 20, peakMin: 50, volName: "이닝", digits: 2, better: "low" },
};

const f = (v, n) => (v == null ? "-" : n === 3 ? Number(v).toFixed(3) : Number(v).toFixed(n));

/** 통산 요약: 시즌 수, 첫·마지막 시즌, 최고 시즌, 통산 합계 */
export function careerSummary(type, rows) {
  const C = CAREER[type], sh = rows.filter(r => r[C.vol] >= C.minShow);
  const tot = rows.reduce((a, r) => a + (r[C.vol] || 0), 0);
  const peakPool = rows.filter(r => r[C.vol] >= C.peakMin && r[C.main] != null);
  const peak = peakPool.length ? peakPool.reduce((b, r) => ((C.better === "high" ? r[C.main] > b[C.main] : r[C.main] < b[C.main]) ? r : b)) : null;
  // 시즌 기록의 가중 평균: 타자는 타석, 투수는 이닝(ERA는 자책점 합과 같아 정확)
  const w = rows.filter(r => r[C.main] != null && r[C.vol] > 0), wsum = w.reduce((a, r) => a + r[C.vol], 0);
  const avgMain = wsum ? w.reduce((a, r) => a + r[C.main] * r[C.vol], 0) / wsum : null;
  const out = { seasons: rows.length, first: rows[0][0], last: rows[rows.length - 1][0], peak, avgMain, shown: sh.length, tot };
  if (type === "batter") out.hr = rows.reduce((a, r) => a + r[9], 0);
  else { out.w = rows.reduce((a, r) => a + r[8], 0); out.l = rows.reduce((a, r) => a + r[9], 0); out.sv = rows.reduce((a, r) => a + r[10], 0); }
  return out;
}

/** 과거 선(선수), 리그 평균 선, 예측 선·띠를 한 그래프 좌표로 만든다. 예측은 올해 시즌이 기준 시즌일 때만 이어 붙인다. */
export function careerPlot(type, rows, league, p, fc, size = {}) {
  const C = CAREER[type], lg = league || {};
  const hist = rows.filter(r => r[C.vol] >= C.minShow && r[C.main] != null).map(r => ({ x: r[0], y: r[C.main], t: `${r[0]} ${r[2]} ${C.stat} ${f(r[C.main], C.digits)} (${r[C.vol]}${C.volName})` }));
  if (hist.length < 1) return null;
  const x0 = hist[0].x, base = fc && fc.meta.base_season;
  const lgPts = Object.keys(lg).map(Number).filter(y => y >= x0 && y <= (base || 9999) && lg[y] != null).map(y => ({ x: y, y: lg[y] }));
  const series = [{ name: "리그 평균", color: "#8e96a6", dash: "4 3", width: 1.6, pts: lgPts, dots: false }, { name: `선수 ${C.stat}`, color: "#101216", width: 2.2, pts: hist, r: 3.3 }];
  const bands = [];
  const useFc = p && fc && base && hist[hist.length - 1].x === base;
  if (useFc) {
    const pts = [{ x: base, y: p.now }, ...p.pred.map(q => ({ x: q.year, y: q.mid, t: `${q.year} 예측 ${f(q.mid, C.digits)} (${f(q.lo, C.digits)}~${f(q.hi, C.digits)})` }))];
    series.push({ name: "앞으로 예측", color: "#5e6ad2", dash: "5 3", width: 2.2, pts, hollow: true, r: 3.6 });
    bands.push({ color: "#e3e6f8", pts: [{ x: base, lo: p.now, hi: p.now }, ...p.pred.map(q => ({ x: q.year, lo: q.lo, hi: q.hi }))] });
  }
  return { geom: plot({ series, bands, yDigits: C.digits === 3 ? 3 : 2, ...size }), useFc, hist };
}
