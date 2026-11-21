// 추가 분석(런 밸류·부하·매치업·공 연결·타순·경기 예측·타구 유형) 계산 (데이터: public/data/more.json / 만드는 곳: ml/more.py)
import { slash } from "./spray.js";
import { esc } from "./pitchlab.js";

export const CAT_NAMES = ["존 밖 공 지켜봄", "존 밖 공 스윙", "존 안 공 지켜봄", "존 안 공 스윙"];
export const PREV_NAMES = ["첫 공", "직전이 직구계", "직전이 변화구", "직전이 오프스피드"];
export const NEXT_NAMES = ["직구계", "변화구", "오프스피드"];
export const MU_B = ["좌투 평균", "우투 평균", "상위 25% 투수", "하위 25% 투수"];
export const MU_P = ["좌타자 평균", "우타자 평균", "상위 25% 타자", "하위 25% 타자"];
export const pc = (a, b) => (b ? (a / b) * 100 : null);
export const per100 = (sum, n) => (n ? (sum / n) * 100 : null);
export const fx = (v, d = 1) => (v == null || Number.isNaN(v) ? "-" : v.toFixed(d));
export const sx = (v, d = 1) => (v == null || Number.isNaN(v) ? "-" : (v >= 0 ? "+" : "") + v.toFixed(d));
export const tone = (d, good = 1) => (d == null || Math.abs(d) < 1e-9 ? "" : d * good > 0 ? "good" : "bad");

/** 6가지 타석 결과 확률 → 보여줄 값 */
export const muStats = P => ({ so: P[0] * 100, bb: P[1] * 100, hit: (P[2] + P[3] + P[4]) * 100, hr: P[4] * 100, obp: (P[1] + P[2] + P[3] + P[4]) * 100 });

/** 타구 유형 한 줄: [종류별 8개, 병살 기회, 병살, 타수 비슷한 값] */
export function bipStats(b) {
  const [k] = b, bo = k[0] + k[1] + k[2];
  return { gbfb: k[1] ? k[0] / k[1] : null, ld: pc(k[2], bo), gdp: pc(b[2], b[1]), roe: k[4], fc: k[5], n: bo };
}

/** 시즌 투수의 선발/구원 구분(한 번 등판에 평균 4이닝 이상이면 선발로 본다) */
export const isStarter = work => { const n = work.reduce((a, r) => a + r[0], 0), o = work.reduce((a, r) => a + r[1], 0); return n ? o / n >= 12 : false; };

/** 여러 선의 추이 그래프(팀 Elo): series = [{name, pts:[[라벨, 값]], color}] */
export function linesSvg(series, { width = "100%", label = "추이 그래프" } = {}) {
  const W = 560, H = 190, L = 44, R = 10, T = 12, B = 22, all = series.flatMap(s => s.pts.map(p => p[1]));
  if (!all.length) return "";
  const mn = Math.floor(Math.min(...all) / 10) * 10, mx = Math.ceil(Math.max(...all) / 10) * 10, n = series[0].pts.length;
  const X = i => L + (i / Math.max(n - 1, 1)) * (W - L - R), Y = v => T + (1 - (v - mn) / (mx - mn || 1)) * (H - T - B);
  const grid = [mn, (mn + mx) / 2, mx].map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#e3e6ee"/><text x="${L - 5}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="#5c667d">${v.toFixed(0)}</text>`).join("");
  const lines = series.map(s => `<path d="${s.pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join("")}" fill="none" stroke="${s.color}" stroke-width="2.2"/>`).join("");
  const step = Math.max(1, Math.floor(n / 6)), xl = series[0].pts.map((p, i) => (i % step === 0 || i === n - 1 ? `<text x="${X(i).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="10" fill="#5c667d">${esc(p[0])}</text>` : "")).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="${width}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">${grid}${lines}${xl}</svg>`;
}
export const TEAM_LINE = ["#2146c7", "#c8302a", "#1f8a4c", "#c9892b"];
export { slash };
