// 타구 방향 그림 계산 (데이터: public/data/spray.json, 만드는 곳: ml/spray.py)
export const ZONES = ["좌익수", "좌중간", "중견수", "우중간", "우익수", "1루수", "2루수", "유격수", "3루수", "투수", "포수"];
export const SIDE_NAMES = ["당겨 침", "가운데", "밀어 침"];
const CX = 200, CY = 330;
const pt = (r, deg) => [CX + r * Math.sin(deg * Math.PI / 180), CY - r * Math.cos(deg * Math.PI / 180)];
const wedge = (r1, r2, a1, a2) => {
  const [x1, y1] = pt(r2, a1), [x2, y2] = pt(r2, a2), [x3, y3] = pt(r1, a2), [x4, y4] = pt(r1, a1);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${r2} ${r2} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}L${x3.toFixed(1)} ${y3.toFixed(1)}A${r1} ${r1} 0 0 0 ${x4.toFixed(1)} ${y4.toFixed(1)}Z`;
};
const OF = [[0, [-45, -15]], [2, [-15, 15]], [4, [15, 45]]];     // 좌익수·중견수·우익수 (좌중간·우중간은 두 외야수에게 절반씩 나눠 이미 합쳐 둔 값)
// ZONES 순서: 0 좌익수 1 좌중간 2 중견수 3 우중간 4 우익수 5 1루수 6 2루수 7 유격수 8 3루수 9 투수 10 포수
const IFA = { 8: [-45, -22], 7: [-22, 0], 6: [0, 22], 5: [22, 45] };
export const SHAPES = (() => {
  const s = [];
  OF.forEach(([i, a]) => { const m = (a[0] + a[1]) / 2, [lx, ly] = pt(235, m); s.push({ i, d: wedge(150, 310, a[0], a[1]), lx, ly }); });
  Object.entries(IFA).forEach(([i, a]) => { const m = (a[0] + a[1]) / 2, [lx, ly] = pt(105, m); s.push({ i: +i, d: wedge(62, 148, a[0], a[1]), lx, ly }); });
  const [px, py] = pt(40, 0), [cx, cy] = pt(10, 0);
  s.push({ i: 9, circle: [px, py, 18], lx: px, ly: py }, { i: 10, circle: [cx, cy + 4, 14], lx: cx + 34, ly: cy + 8 });
  return s;
})();
export const pctOf = (a, n) => (n ? (a / n) * 100 : 0);
export const f1 = v => (v == null || Number.isNaN(v) ? "-" : v.toFixed(1));
export const lowSample = n => n < 60;

const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/** 야구장 모양 방향 그림(SVG 문자열). 화면과 PDF가 같은 그림을 쓴다. mode: "share"(타구가 간 비율) | "hit"(안타 비율) */
export function fieldSvg(e, mode = "share", { width = "100%", label = "타구 방향 그림" } = {}) {
  const val = i => (mode === "share" ? pctOf(e.z[i], e.n) : pctOf(e.zh[i], e.z[i]));
  const max = Math.max(...ZONES.map((_, i) => val(i)), 1);
  const shapes = SHAPES.map(s => {
    const v = val(s.i), rel = mode === "share" ? e.z[s.i] : e.zh[s.i], a = 0.12 + 0.78 * (v / max);
    const fill = `rgba(33,70,199,${rel ? a.toFixed(2) : 0.05})`, ink = a > 0.55 && rel ? "#fff" : "#101216";
    const sh = s.circle ? `<circle cx="${s.circle[0].toFixed(1)}" cy="${s.circle[1].toFixed(1)}" r="${s.circle[2]}" fill="${fill}" stroke="#fff" stroke-width="2"/>` : `<path d="${s.d}" fill="${fill}" stroke="#fff" stroke-width="2"/>`;
    return `${sh}<text x="${s.lx.toFixed(1)}" y="${s.ly.toFixed(1)}" text-anchor="middle" fill="${ink}" font-weight="700"><tspan x="${s.lx.toFixed(1)}" dy="-0.2em" font-size="9.5" font-weight="400">${ZONES[s.i]}</tspan><tspan x="${s.lx.toFixed(1)}" dy="1.2em" font-size="11">${f1(val(s.i))}%</tspan></text>`;
  }).join("");
  const aria = `${label}. ${ZONES.map((z, i) => (i === 1 || i === 3 ? "" : `${z} ${f1(val(i))}%`)).filter(Boolean).join(", ")}`;
  return `<svg viewBox="0 0 400 350" width="${width}" role="img" aria-label="${esc(aria)}" xmlns="http://www.w3.org/2000/svg"><path d="M200 330 L20 150 A255 255 0 0 1 380 150 Z" fill="#e7ede3"/>${shapes}<path d="M200 330 L215 315 L200 300 L185 315 Z" fill="#fff" stroke="#8d9ab8"/></svg>`;
}
export const PGROUP_NAMES = ["직구계(직구·투심·커터)", "변화구(슬라이더·스위퍼·커브)", "오프스피드(체인지업·포크)"];

/** [타석, 타수, 안타, 2루타, 3루타, 홈런, 볼넷, 사구, 삼진, 희생플라이] → 타율·출루율·장타율·OPS·삼진%·볼넷% */
export function slash(a) {
  if (!a || !a[0]) return null;
  const [pa, ab, h, b2, b3, hr, bb, hbp, so, sf] = a, tb = h + b2 + 2 * b3 + 3 * hr;
  const avg = ab ? h / ab : null, obpD = ab + bb + hbp + sf, obp = obpD ? (h + bb + hbp) / obpD : null, slg = ab ? tb / ab : null;
  return { pa, avg, obp, slg, ops: obp != null && slg != null ? obp + slg : null, so: pa ? (so / pa) * 100 : null, bb: pa ? (bb / pa) * 100 : null };
}
export const f3 = v => (v == null ? "-" : v.toFixed(3).replace(/^0\./, "."));
export const HAND = { L: "좌", R: "우" };

/** 수비수별 타구 수·안타 수 (좌중간·우중간은 데이터에서 이미 두 외야수에게 절반씩 나눠 두었다). */
export const DEF_POS = ["좌익수", "중견수", "우익수", "1루수", "2루수", "유격수", "3루수", "투수", "포수"];
export function defense(b) {
  return [0, 2, 4, 5, 6, 7, 8, 9, 10].map(i => ({ n: b.z[i], h: b.zh[i], rate: b.z[i] ? (b.zh[i] / b.z[i]) * 100 : null }));
}
/** 나눈 타구는 .5 단위가 생기므로 개수는 정수면 그대로, 아니면 소수 한 자리로 보여 준다. */
export const cn = v => (v == null ? "-" : Number.isInteger(v) ? String(v) : v.toFixed(1));
