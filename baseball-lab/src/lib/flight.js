// 공의 움직임(궤적)·구종 비교(터널링)·다음 공 예측 계산과 그림 (2026 시즌 투수)
// 궤적은 PITCHf/x 9-파라미터 [x0,y0,z0,vx0,vy0,vz0,ax,ay,az] (단위 ft, s): 위치 = 시작 위치 + 속도·t + 가속도·t²/2
// 좌표: x는 포수 시점에서 오른쪽(1루 쪽), y는 투수 쪽(홈플레이트 앞면이 y=17/12), z는 높이
import { esc } from "./pitchlab.js";

export const Y_PLATE = 17 / 12, Y_REL = 54.5, Y_RUBBER = 60.5, DECISION = 0.167, FT_CM = 30.48;
export const TYPE_COLORS = { 직구: "#d0312d", 투심: "#e0509a", 슬라이더: "#2146c7", 스위퍼: "#6f4bd8", 커터: "#17734f", 커브: "#0c8ea8", 체인지업: "#c9892b", 포크: "#7a5c3e" };
export const tcol = name => TYPE_COLORS[name] || "#5c667d";
export const VIEWS = [["catcher", "포수 시점"], ["side", "옆에서"], ["top", "위에서"]];

export const posAt = (m, t) => [m[0] + m[3] * t + (m[6] * t * t) / 2, m[1] + m[4] * t + (m[7] * t * t) / 2, m[2] + m[5] * t + (m[8] * t * t) / 2];
export function tAtY(m, y) {
  const a = m[7] / 2, b = m[4], c = m[1] - y, disc = b * b - 4 * a * c;
  if (disc < 0 || a === 0) return null;
  return (-b - Math.sqrt(disc)) / (2 * a);
}
/** 릴리스(54.5ft)부터 홈플레이트까지 점들. tNow(릴리스 후 초)가 있으면 거기까지 */
export function pathOf(m, steps = 36, tNow = Infinity) {
  const t0 = tAtY(m, Y_REL), t1 = tAtY(m, Y_PLATE);
  if (t0 == null || t1 == null) return null;
  const tEnd = Math.min(t1, t0 + tNow), pts = [];
  for (let k = 0; k <= steps; k++) pts.push(posAt(m, t0 + ((tEnd - t0) * k) / steps));
  return pts;
}
export const flightTime = m => { const t0 = tAtY(m, Y_REL), t1 = tAtY(m, Y_PLATE); return t0 == null || t1 == null ? null : t1 - t0; };

function projector(view, w, h) {
  const pad = 26;
  if (view === "catcher") {
    // 홈플레이트 뒤 20ft, 릴리스와 비슷한 높이에 둔 원근 투영
    const camY = -20, camZ = 4.6, d0 = Y_PLATE - camY, f = Math.min((w * 0.5 * d0) / 2.8, h * 4.2), cy = h * 0.22;
    return ([x, y, z]) => { const d = y - camY; return [w / 2 + (f * x) / d, cy - (f * (z - camZ)) / d]; };
  }
  const sx = y => pad + ((Y_RUBBER + 1 - y) / (Y_RUBBER + 1)) * (w - pad * 2);
  if (view === "side") return ([, y, z]) => [sx(y), h - pad - (z / 8) * (h - pad * 2)];
  return ([x, y]) => [sx(y), h / 2 - (x / 3) * (h / 2 - pad)];
}

/**
 * 궤적 그림. means: [{t(구종 이름), m(파라미터 9개), n}], each: 개별 투구 [{t, m}], tNow: 재생 중이면 릴리스 후 초(없으면 도착까지 전부)
 * 측정 시작 지점(y0) 이전은 추정 구간이라 점선으로 그린다.
 */
export function trajSvg({ means, each = [], view = "catcher", tNow = null, width = "100%", w = 520, h = 400, label = "공의 궤적 그림", zone = [1.61, 3.33, 0.83], fs = 11, lw = 3 }) {
  const P = projector(view, w, h), pt = q => P(q).map(v => v.toFixed(1)).join(",");
  const [zb, zt, hw] = zone;
  let g = "";
  if (view === "catcher") g += `<polygon points="${[[-hw, Y_PLATE, zb], [hw, Y_PLATE, zb], [hw, Y_PLATE, zt], [-hw, Y_PLATE, zt]].map(pt).join(" ")}" fill="none" stroke="currentColor" stroke-width="1.5"/>`;
  else if (view === "side") g += `<polyline points="${[[0, Y_PLATE, zb], [0, Y_PLATE, zt]].map(pt).join(" ")}" stroke="currentColor" stroke-width="3"/><text x="8" y="16" font-size="${fs}" fill="currentColor" opacity=".7">투수판</text>`;
  else g += `<polyline points="${[[-hw, Y_PLATE, 0], [hw, Y_PLATE, 0]].map(pt).join(" ")}" stroke="currentColor" stroke-width="3"/><text x="8" y="16" font-size="${fs}" fill="currentColor" opacity=".7">투수판</text>`;
  if (view !== "catcher") {
    const g0 = P([0, Y_RUBBER, 0]), g1 = P([0, Y_PLATE, 0]);
    g += `<line x1="${g0[0].toFixed(1)}" y1="${(view === "side" ? h - 26 : h / 2).toFixed(1)}" x2="${g1[0].toFixed(1)}" y2="${(view === "side" ? h - 26 : h / 2).toFixed(1)}" stroke="currentColor" opacity=".25"/>`;
  }
  for (const e of each) {
    const pts = pathOf(e.m, 24, tNow == null ? Infinity : tNow);
    if (pts) g += `<polyline points="${pts.map(pt).join(" ")}" fill="none" stroke="${tcol(e.t)}" stroke-width="1" opacity=".28"/>`;
  }
  for (const x of means) {
    const pts = pathOf(x.m, 36, tNow == null ? Infinity : tNow);
    if (!pts) continue;
    const cut = pts.findIndex(q => q[1] <= x.m[1]), c = tcol(x.t);
    const solid = cut < 0 ? [] : pts.slice(cut), dash = cut < 0 ? pts : pts.slice(0, cut + 1);
    if (dash.length > 1) g += `<polyline points="${dash.map(pt).join(" ")}" fill="none" stroke="${c}" stroke-width="${lw}" stroke-dasharray="3 4"/>`;
    if (solid.length > 1) g += `<polyline points="${solid.map(pt).join(" ")}" fill="none" stroke="${c}" stroke-width="${lw}"/>`;
    const [ex, ey] = P(pts[pts.length - 1]);
    g += `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${(tNow == null ? 5 : 6) * lw / 3}" fill="${c}" stroke="var(--white,#fff)" stroke-width="2"/>`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" style="width:${width};height:auto;color:var(--ink,#111);display:block" role="img" aria-label="${esc(label)}">${g}</svg>`;
}

/** 두 구종의 평균 궤적을 '홈 도착 전 같은 시간'에 맞춰 비교 (터널링). 거리는 포수 시점 평면(좌우·높이) cm */
export function tunnelStats(a, b) {
  const ta = tAtY(a, Y_PLATE), tb = tAtY(b, Y_PLATE), ra = tAtY(a, Y_REL), rb = tAtY(b, Y_REL);
  if ([ta, tb, ra, rb].some(v => v == null)) return null;
  const gap = (p, q) => Math.hypot(p[0] - q[0], p[2] - q[2]) * FT_CM;
  const at = tau => gap(posAt(a, ta - tau), posAt(b, tb - tau));
  const flight = Math.min(ta - ra, tb - rb), curve = [];
  for (let k = 0; k <= 40; k++) { const tau = flight * (1 - k / 40); curve.push([tau, at(tau)]); }
  const release = gap(posAt(a, ra), posAt(b, rb)), decision = at(DECISION), plate = at(0);
  return { release, decision, plate, ratio: decision > 0 ? plate / decision : 0, curve, flight };
}

/** 터널링 곡선 그림: 가로는 홈 도착까지 남은 시간(왼쪽이 릴리스), 세로는 두 구종 사이 거리 */
export function tunnelSvg(rows, { width = "100%", w = 520, h = 260, label = "터널링 그림", fs = 10 } = {}) {
  const padL = 40, padR = 14, padT = 30, padB = 30;
  const fl = Math.max(...rows.map(r => r.s.flight)), top = Math.max(10, ...rows.map(r => Math.max(...r.s.curve.map(c => c[1])))) * 1.05;
  const X = tau => padL + ((fl - tau) / fl) * (w - padL - padR), Y = v => h - padB - (v / top) * (h - padT - padB);
  let g = "";
  for (let k = 0; k <= 4; k++) { const v = (top * k) / 4; g += `<line x1="${padL}" x2="${w - padR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="currentColor" opacity=".12"/><text x="${padL - 6}" y="${(Y(v) + 4).toFixed(1)}" font-size="${fs}" text-anchor="end" fill="currentColor" opacity=".7">${v.toFixed(0)}</text>`; }
  g += `<text x="6" y="12" font-size="${fs}" fill="currentColor" opacity=".7">두 구종 사이 거리(cm)</text>`;
  g += `<line x1="${X(DECISION).toFixed(1)}" x2="${X(DECISION).toFixed(1)}" y1="${padT}" y2="${h - padB}" stroke="var(--red,#d0312d)" stroke-dasharray="4 4"/><text x="${(X(DECISION) - 5).toFixed(1)}" y="${padT + 9}" font-size="${fs}" text-anchor="end" fill="var(--red,#d0312d)">타자 판단 시점</text>`;
  g += `<text x="${padL}" y="${h - 8}" font-size="${fs}" fill="currentColor" opacity=".7">릴리스</text><text x="${w - padR}" y="${h - 8}" font-size="${fs}" text-anchor="end" fill="currentColor" opacity=".7">홈플레이트</text>`;
  for (const r of rows) {
    const c = tcol(r.t);
    g += `<polyline points="${r.s.curve.map(([tau, v]) => `${X(tau).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="${c}" stroke-width="2.5"/>`;
    for (const [tau, v] of [[DECISION, r.s.decision], [0, r.s.plate]]) g += `<circle cx="${X(tau).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="4" fill="${c}" stroke="var(--white,#fff)" stroke-width="1.5"/>`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" style="width:${width};height:auto;color:var(--ink,#111);display:block" role="img" aria-label="${esc(label)}">${g}</svg>`;
}

// ---------------------------------------------------------------- 다음 공 예측 (표로 미리 계산한 값 읽기)
export const COUNTS = Array.from({ length: 12 }, (_, c) => ({ c, b: Math.floor(c / 3), s: c % 3, name: `${Math.floor(c / 3)}-${c % 3}` }));
export const cgOf = c => { const b = Math.floor(c / 3), s = c % 3; return b === 0 && s === 0 ? 0 : s === 2 ? 1 : b > s ? 2 : 3; };
export const CG_LABEL = ["초구", "2스트라이크", "볼이 더 많은 카운트", "그 외 카운트"];

/** f: flight.json의 선수 항목. c: 카운트 번호(0~11), st: 0 우타/1 좌타, prev: ty 안의 위치 또는 -1(직전 공 없음) */
export function typeProbs(f, c, st, prev) {
  const k = f.ty.length, pv = prev < 0 ? k : prev, o = ((c * 2 + st) * (k + 1) + pv) * k;
  return f.ty.map((t, j) => ({ t, p: f.tp[o + j] / 1000 }));
}
export const zoneProbs = (f, j, st, c) => f.zn[j * 2 + st][cgOf(c)].map(v => v / 1000);
export const whiffProb = (f, j, st, c) => f.wh[(j * 2 + st) * 4 + cgOf(c)] / 1000;
export const evidence = (f, c, st) => f.ev[c * 2 + st];

/** 코스 13칸 그림 (포수 시점, 존 3x3 + 바깥 4칸), 확률이 클수록 진하게 */
export function zoneProbSvg(probs, { width = "100%", color = "#2146c7", label = "예상 코스 그림" } = {}) {
  const W = 220, H = 260, cw = 46, x0 = 41, y0 = 52, mx = Math.max(...probs, 0.01);
  const cell = (x, y, w, h, p, name) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" fill-opacity="${(0.08 + 0.85 * (p / mx)).toFixed(2)}" stroke="currentColor" stroke-opacity=".35"><title>${esc(name)} ${(p * 100).toFixed(1)}%</title></rect><text x="${x + w / 2}" y="${y + h / 2 + 4}" font-size="11" text-anchor="middle" fill="${p / mx > 0.55 ? "#fff" : "currentColor"}">${(p * 100).toFixed(0)}</text>`;
  let g = "";
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g += cell(x0 + c * cw, y0 + r * cw, cw, cw, probs[r * 3 + c], "존 안");
  g += cell(x0 - 40, 6, 40, 40, probs[9], "바깥 위·3루쪽") + cell(x0 + 3 * cw, 6, 40, 40, probs[10], "바깥 위·1루쪽") + cell(x0 - 40, y0 + 3 * cw + 6, 40, 40, probs[11], "바깥 아래·3루쪽") + cell(x0 + 3 * cw, y0 + 3 * cw + 6, 40, 40, probs[12], "바깥 아래·1루쪽");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:${width};max-width:260px;height:auto;color:var(--ink,#111);display:block" role="img" aria-label="${esc(label)}">${g}</svg>`;
}
