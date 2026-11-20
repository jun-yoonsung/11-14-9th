// 투구 분석·상황·폼 계산 (데이터: public/data/pitchlab.json, situ.json, form.json / 만드는 곳: ml/pitchlab.py)
import { slash } from "./spray.js";

export const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const PG_NAMES = ["직구계", "변화구", "오프스피드"];
export const ZMETRICS = [["n", "공이 간 곳"], ["swing", "스윙한 비율"], ["whiff", "헛스윙 비율"], ["called", "그냥 보낸 공 중 스트라이크 판정"], ["hit", "타구가 안타가 된 비율"]];

/** 5×5 칸 × 공 종류 묶음 3개 × 6개 값 [공, 스윙, 헛스윙, 콜 스트라이크, 인플레이, 안타]를 한 묶음으로 합친다. pg: -1=전체 */
export function cells(flat, pg = -1) {
  const out = Array.from({ length: 25 }, () => [0, 0, 0, 0, 0, 0]);
  for (let g = 0; g < 3; g++) { if (pg >= 0 && g !== pg) continue; for (let c = 0; c < 25; c++) for (let k = 0; k < 6; k++) out[c][k] += flat[(g * 25 + c) * 6 + k]; }
  return out;
}
const val = (c, m, tot) => {
  if (m === "n") return tot ? (c[0] / tot) * 100 : 0;
  if (m === "swing") return c[0] ? (c[1] / c[0]) * 100 : null;
  if (m === "whiff") return c[1] ? (c[2] / c[1]) * 100 : null;
  if (m === "called") return c[0] - c[1] > 0 ? (c[3] / (c[0] - c[1])) * 100 : null;
  return c[4] ? (c[5] / c[4]) * 100 : null;
};
const minN = { n: 1, swing: 15, whiff: 10, called: 15, hit: 8 };
const den = (c, m) => (m === "n" ? c[0] : m === "swing" ? c[0] : m === "whiff" ? c[1] : m === "called" ? c[0] - c[1] : c[4]);

/** 스트라이크 존 히트맵(SVG). 가운데 3×3이 스트라이크 존이고 바깥 한 겹은 존 밖 공이에요. 포수가 보는 방향이라 오른쪽이 1루 쪽입니다. */
export function zoneSvg(flat, metric = "n", pg = -1, { width = "100%", label = "투구 존 그림" } = {}) {
  const cs = cells(flat, pg), tot = cs.reduce((a, c) => a + c[0], 0);
  const vals = cs.map(c => (den(c, metric) >= minN[metric] ? val(c, metric, tot) : null));
  const mx = Math.max(...vals.filter(v => v != null), 1), W = 50;
  let body = "";
  for (let row = 4; row >= 0; row--) for (let col = 0; col < 5; col++) {
    const i = row * 5 + col, v = vals[i], x = 10 + col * W, y = 10 + (4 - row) * W;
    const a = v == null ? 0.04 : 0.1 + 0.8 * (v / mx), ink = a > 0.55 ? "#fff" : "#101216";
    body += `<rect x="${x}" y="${y}" width="${W}" height="${W}" fill="rgba(33,70,199,${a.toFixed(2)})" stroke="#fff" stroke-width="1.5"/>`;
    body += `<text x="${x + W / 2}" y="${y + W / 2 + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${ink}">${v == null ? "·" : v.toFixed(metric === "n" ? 1 : 0) + "%"}</text>`;
  }
  const zone = `<rect x="${10 + W}" y="${10 + W}" width="${3 * W}" height="${3 * W}" fill="none" stroke="#101216" stroke-width="2.2"/>`;
  const aria = `${label}. ` + vals.map((v, i) => (v == null ? "" : `${Math.floor(i / 5) + 1}행 ${(i % 5) + 1}열 ${v.toFixed(0)}%`)).filter(Boolean).join(", ");
  return `<svg viewBox="0 0 270 270" width="${width}" role="img" aria-label="${esc(aria)}" xmlns="http://www.w3.org/2000/svg">${body}${zone}</svg>`;
}

/** 칸 합계에서 존 안·밖 스윙 지표를 뽑는다 (바깥 한 겹 = 존 밖) */
export function zoneStats(flat, pg = -1) {
  const cs = cells(flat, pg); let zn = 0, zs = 0, zw = 0, on = 0, os = 0, ow = 0;
  cs.forEach((c, i) => { const row = Math.floor(i / 5), col = i % 5, inz = row >= 1 && row <= 3 && col >= 1 && col <= 3; if (inz) { zn += c[0]; zs += c[1]; zw += c[2]; } else { on += c[0]; os += c[1]; ow += c[2]; } });
  const pc = (a, b) => (b ? (a / b) * 100 : null);
  return { zn, on, zswing: pc(zs, zn), chase: pc(os, on), zcontact: pc(zs - zw, zs), ocontact: pc(os - ow, os), zonePct: pc(zn, zn + on), whiff: pc(zw + ow, zs + os) };
}

/** 구종 한 줄 → 사람이 읽는 값 */
export const ARS = { n: 0, spd: 1, sd: 2, max: 3, hm: 4, vm: 5, rx: 6, rz: 7, rsd: 8, sw: 9, wh: 10, cs: 11, zn: 12, on: 13, osw: 14, st: 15 };
export function arsRow(a, total, stuffMean) {
  const pc = (x, y) => (y ? (x / y) * 100 : null);
  return { n: a[0], use: pc(a[0], total), spd: a[1], max: a[3], hm: a[4], vm: a[5], rz: a[7], rx: a[6], rsd: a[8], whiff: pc(a[10], a[9]), csw: pc(a[10] + a[11], a[0]), zone: pc(a[12], a[0]), chase: pc(a[14], a[13]), stuff: a[15] != null && stuffMean ? (a[15] / stuffMean) * 100 : null };
}

/** 롤링 그래프(SVG): ys는 경기마다의 값, avg는 시즌 평균 기준선 */
export function rollSvg(xs, ys, avg, { width = "100%", color = "#2146c7", fmt = v => v.toFixed(3), label = "추이 그래프", lo = null, hi = null } = {}) {
  const W = 560, H = 170, L = 44, R = 10, T = 12, B = 22, pts = ys.filter(v => v != null);
  if (pts.length < 2) return "";
  const mn = lo ?? Math.min(...pts, avg) * 0.97, mx = hi ?? Math.max(...pts, avg) * 1.03;
  const X = i => L + (i / (ys.length - 1)) * (W - L - R), Y = v => T + (1 - (v - mn) / (mx - mn || 1)) * (H - T - B);
  const path = ys.map((v, i) => (v == null ? "" : `${i && ys[i - 1] != null ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)).join("");
  const ticks = [mn, (mn + mx) / 2, mx].map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#e3e6ee"/><text x="${L - 5}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="#5c667d">${fmt(v)}</text>`).join("");
  const step = Math.max(1, Math.floor(ys.length / 6));
  const xl = xs.map((x, i) => (i % step === 0 || i === xs.length - 1 ? `<text x="${X(i).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="10" fill="#5c667d">${esc(x)}</text>` : "")).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="${width}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">${ticks}<line x1="${L}" x2="${W - R}" y1="${Y(avg).toFixed(1)}" y2="${Y(avg).toFixed(1)}" stroke="#c8302a" stroke-dasharray="5 4" stroke-width="1.5"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.2"/>${xl}</svg>`;
}

/** 경기별 기록 → 최근 N경기 누적 OPS 열 */
export function rolling(games, n = 15) {
  const out = [];
  for (let i = 0; i < games.length; i++) {
    if (i + 1 < Math.min(n, 8)) { out.push(null); continue; }
    const w = games.slice(Math.max(0, i - n + 1), i + 1), s = new Array(10).fill(0);
    w.forEach(g => g.slice(1).forEach((v, k) => (s[k] += v)));
    const sl = slash(s); out.push(sl ? sl.ops : null);
  }
  return out;
}
export const sumGames = games => { const s = new Array(10).fill(0); games.forEach(g => g.slice(1).forEach((v, k) => (s[k] += v))); return s; };

export const SIT_LABELS = {
  bat: { empty: "주자 없음", on: "주자 있음", risp: "득점권(2·3루)", risp2: "2아웃 득점권", loaded: "만루", close: "접전(2점 차 이내)", late: "7회 이후 접전", ahead3: "3점 이상 앞섬", behind3: "3점 이상 뒤짐", hi: "승부처(레버리지 1.5 이상)", lo: "여유 있는 상황(0.7 미만)", i13: "1~3회", i46: "4~6회", i79: "7회 이후", o0: "무사", o1: "1사", o2: "2사" },
  pit: { empty: "주자 없음", on: "주자 있음", risp: "득점권 허용", risp2: "2아웃 득점권", loaded: "만루", close: "접전(2점 차 이내)", late: "7회 이후 접전", ahead3: "3점 이상 뒤진 채 던짐", behind3: "3점 이상 앞선 채 던짐", hi: "승부처(레버리지 1.5 이상)", lo: "여유 있는 상황(0.7 미만)", i13: "1~3회", i46: "4~6회", i79: "7회 이후", o0: "무사", o1: "1사", o2: "2사" },
};
export const SIT_SHOW = ["empty", "on", "risp", "risp2", "loaded", "close", "late", "hi", "lo", "i13", "i46", "i79", "o0", "o1", "o2", "ahead3", "behind3"];
export const CG_NAMES = ["초구", "타자 유리(볼이 많음)", "같은 카운트", "투수 유리(스트라이크가 많음)", "2스트라이크"];
export const fmt = (v, d = 1) => (v == null || Number.isNaN(v) ? "-" : v.toFixed(d));
export const sgn = (v, d = 1) => (v == null ? "-" : (v >= 0 ? "+" : "") + v.toFixed(d));
