/* 선수 순위 계산: 열 정의, 규칙형 유형, K-평균 자동 군집 (화면은 pages/Rank.jsx) */
const div = (a, b) => (b ? a / b : null);
export const pc = v => (v == null ? "-" : (v * 100).toFixed(1) + "%");
const f1 = v => (v == null ? "-" : v.toFixed(1)), f2 = v => (v == null ? "-" : v.toFixed(2));
const f3 = v => (v == null ? "-" : v < 1 ? v.toFixed(3).replace(/^0/, "") : v.toFixed(3));
const f0 = v => (v == null ? "-" : String(Math.round(v)));

const bpa = s => s.ab + s.bb + s.hbp + s.sf;
const bf = s => s.outs + s.h + s.bb + s.hbp;   // 상대한 타자 수(근사)
const obp = s => div(s.h + s.bb + s.hbp, bpa(s)), slg = s => div(s.h + s.d2 + 2 * s.d3 + 3 * s.hr, s.ab);

export const COLS = {
  batter: [
    { k: "pa", t: "타석", f: f0, v: s => s.pa }, { k: "avg", t: "타율", f: f3, v: s => div(s.h, s.ab) }, { k: "obp", t: "출루율", f: f3, v: obp },
    { k: "slg", t: "장타율", f: f3, v: slg }, { k: "ops", t: "OPS", f: f3, v: s => (obp(s) == null || slg(s) == null ? null : obp(s) + slg(s)) },
    { k: "hr", t: "홈런", f: f0, v: s => s.hr }, { k: "bb", t: "BB%", f: pc, v: s => div(s.bb, bpa(s)) }, { k: "so", t: "K%", f: pc, v: s => div(s.so, bpa(s)) },
    { k: "con", t: "컨택%", f: pc, v: s => div(s.sw - s.wh, s.sw) }, { k: "chs", t: "Chase%", f: pc, v: s => div(s.ozsw, s.oz) },
  ],
  pitcher: [
    { k: "ip", t: "이닝", f: f1, v: s => s.outs / 3 }, { k: "era", t: "ERA", f: f2, v: s => div(s.er * 27, s.outs) },
    { k: "fip", t: "FIP", f: f2, v: s => (s.outs ? (13 * s.hr + 3 * s.bb - 2 * s.so) / (s.outs / 3) + 3.1 : null) },
    { k: "k", t: "K%", f: pc, v: s => div(s.so, bf(s)) }, { k: "b", t: "BB%", f: pc, v: s => div(s.bb, bf(s)) },
    { k: "kb", t: "K-BB%", f: pc, v: s => (bf(s) ? (s.so - s.bb) / bf(s) : null) }, { k: "wh", t: "헛스윙%", f: pc, v: s => div(s.wh, s.sw) },
    { k: "chs", t: "유인%", f: pc, v: s => div(s.ozsw, s.oz) }, { k: "fb", t: "직구 구속", f: f1, v: s => (s.fb > 0 ? s.fb : null) },
  ],
};
export const FIRST_SORT = { batter: "ops", pitcher: "era" };
export const LOW_FIRST = ["era", "fip", "b"];   // 낮을수록 좋아 오름차순이 기본인 열

// 유형 버튼(규칙형): 임계값을 화면에 그대로 보여 준다
export const RULES = {
  batter: [
    { id: "pow", t: "파워 (홈런 20개↑)", rule: "홈런이 20개 이상", ok: s => s.hr >= 20 },
    { id: "con", t: "컨택형 (컨택% 84%↑)", rule: "스윙한 공 중 84% 이상을 맞힘", ok: s => div(s.sw - s.wh, s.sw) >= 0.84 },
    { id: "eye", t: "선구안 좋은 (BB% 10%↑·Chase% 25%↓)", rule: "볼넷 비율 10% 이상이고 존 밖 스윙 비율 25% 이하", ok: s => div(s.bb, bpa(s)) >= 0.10 && div(s.ozsw, s.oz) <= 0.25 },
  ],
  pitcher: [
    { id: "pow", t: "파워 피처 (K% 24%↑)", rule: "삼진 비율이 24% 이상", ok: s => div(s.so, bf(s)) >= 0.24 },
    { id: "ctl", t: "제구 장인 (BB% 6.5%↓)", rule: "볼넷 비율이 6.5% 이하", ok: s => div(s.bb, bf(s)) <= 0.065 },
    { id: "bad", t: "결과가 아쉬운 (FIP가 ERA보다 0.75↓)", rule: "FIP가 평균자책점보다 0.75 이상 낮음(운이 나빴을 가능성)", ok: s => s.outs && COLS.pitcher[2].v(s) <= COLS.pitcher[1].v(s) - 0.75 },
    { id: "whf", t: "헛스윙 유도형 (헛스윙% 25%↑)", rule: "타자가 휘두른 공 중 25% 이상이 헛스윙", ok: s => div(s.wh, s.sw) >= 0.25 },
  ],
};

// ---------- K-평균 군집 (브라우저에서 즉석 계산) ----------
const FEAT = {
  batter: [["K%", COLS.batter[7].v], ["BB%", COLS.batter[6].v], ["컨택%", COLS.batter[8].v], ["Chase%", COLS.batter[9].v], ["ISO", s => (slg(s) == null ? null : slg(s) - s.h / s.ab)]],
  pitcher: [["K%", COLS.pitcher[3].v], ["BB%", COLS.pitcher[4].v], ["헛스윙%", COLS.pitcher[6].v], ["구속", COLS.pitcher[8].v]],
};
export const fmtFeat = (f, v) => (f === "구속" ? v.toFixed(1) + "km/h" : f === "ISO" ? f3(v) : pc(v));
const rng = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const dist2 = (a, b) => a.reduce((t, v, i) => t + (v - b[i]) ** 2, 0);

function kmeans(X, k, seed) {
  const r = rng(seed), n = X.length, d = X[0].length;
  const cen = [X[Math.floor(r() * n)].slice()];
  while (cen.length < k) {   // k-means++ 초기화
    const w = X.map(x => Math.min(...cen.map(c => dist2(x, c)))), tot = w.reduce((a, b) => a + b, 0);
    let t = r() * tot, i = 0; while (i < n - 1 && (t -= w[i]) > 0) i++;
    cen.push(X[i].slice());
  }
  let lab = new Array(n).fill(-1), c = cen;
  for (let it = 0; it < 60; it++) {
    const nl = X.map(x => { let b = 0, bd = Infinity; c.forEach((cc, j) => { const dd = dist2(x, cc); if (dd < bd) { bd = dd; b = j; } }); return b; });
    const same = nl.every((v, i) => v === lab[i]); lab = nl; if (same) break;
    c = c.map((cc, j) => { const m = X.filter((_, i) => lab[i] === j); return m.length ? Array.from({ length: d }, (_, q) => m.reduce((t, x) => t + x[q], 0) / m.length) : cc; });
  }
  return { lab, inertia: X.reduce((t, x, i) => t + dist2(x, c[lab[i]]), 0) };
}
function silhouette(X, lab, k) {
  const dist = (a, b) => Math.sqrt(dist2(a, b));
  let tot = 0;
  X.forEach((x, i) => {
    const sum = new Array(k).fill(0), cnt = new Array(k).fill(0);
    X.forEach((y, j) => { if (i !== j) { sum[lab[j]] += dist(x, y); cnt[lab[j]]++; } });
    if (!cnt[lab[i]]) return;
    const a = sum[lab[i]] / cnt[lab[i]];
    let b = Infinity; for (let c = 0; c < k; c++) if (c !== lab[i] && cnt[c]) b = Math.min(b, sum[c] / cnt[c]);
    tot += (b - a) / Math.max(a, b);
  });
  return tot / X.length;
}
export function cluster(type, rows) {
  const fs = FEAT[type], ok = rows.filter(s => fs.every(f => f[1](s) != null));
  if (ok.length < 12) return null;
  const raw = ok.map(s => fs.map(f => f[1](s)));
  const mu = fs.map((_, q) => raw.reduce((t, x) => t + x[q], 0) / raw.length);
  const sd = fs.map((_, q) => Math.sqrt(raw.reduce((t, x) => t + (x[q] - mu[q]) ** 2, 0) / raw.length) || 1);
  const X = raw.map(x => x.map((v, q) => (v - mu[q]) / sd[q]));
  let best = null;
  for (let k = 2; k <= 6 && k <= ok.length / 4; k++) {
    let run = null; for (let s = 1; s <= 8; s++) { const m = kmeans(X, k, s * 7919); if (!run || m.inertia < run.inertia) run = m; }
    const sil = silhouette(X, run.lab, k);
    if (!best || sil > best.sil) best = { k, sil, lab: run.lab };
  }
  const groups = Array.from({ length: best.k }, (_, j) => {
    const idx = ok.map((_, i) => i).filter(i => best.lab[i] === j);
    const z = fs.map((_, q) => idx.reduce((t, i) => t + X[i][q], 0) / idx.length);
    const avg = fs.map((_, q) => idx.reduce((t, i) => t + raw[i][q], 0) / idx.length);
    const hi = [], lo = [];
    z.forEach((v, q) => { if (v > 0.4) hi.push(fs[q][0] + "↑"); else if (v < -0.4) lo.push(fs[q][0] + "↓"); });
    return { j, n: idx.length, name: hi.concat(lo).join(" · ") || "평균형", avg, ids: new Set(idx.map(i => ok[i].pid)) };
  });
  return { k: best.k, sil: best.sil, groups, feats: fs.map(f => f[0]), n: ok.length };
}
