/* 선 그래프 좌표 계산. 화면(SVG)과 PDF(HTML 글자)가 같은 좌표를 쓰도록 계산만 한다. */

/** 보기 좋은 눈금 간격(1·2·5·10…)으로 정수 눈금을 고른다 */
function niceTicks(lo, hi, max = 8) {
  const span = Math.max(hi - lo, 1); let step = 1;
  for (const s of [1, 2, 5, 10, 20]) { step = s; if (span / s <= max) break; }
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}

/**
 * series: [{ name, color, dash?, width?, pts: [{x, y, t?}], dots?: boolean, hollow?: boolean }]
 * bands:  [{ color, pts: [{x, lo, hi}] }]
 * 연속하지 않는 x(예: 군 복무로 쉰 해)는 선을 끊는다.
 */
export function plot({ series = [], bands = [], W = 640, H = 240, L = 46, R = 14, T = 14, B = 30, yDigits = 2, xTickMax = 8, xFmt = v => String(v), yPad = 0.12 }) {
  const xs = [...series.flatMap(s => s.pts.map(p => p.x)), ...bands.flatMap(b => b.pts.map(p => p.x))];
  const ys = [...series.flatMap(s => s.pts.map(p => p.y)), ...bands.flatMap(b => b.pts.flatMap(p => [p.lo, p.hi]))].filter(v => v != null);
  if (!xs.length || !ys.length) return null;
  const x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo) * yPad || 0.1, y0 = lo - pad, y1 = hi + pad;
  const X = v => L + (x1 === x0 ? 0.5 : (v - x0) / (x1 - x0)) * (W - L - R), Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const paths = series.map(s => {
    let d = "", prev = null;
    for (const p of s.pts.slice().sort((a, b) => a.x - b.x)) { d += `${prev == null || p.x - prev > 1.5 ? "M" : "L"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)} `; prev = p.x; }
    return { name: s.name, color: s.color, dash: s.dash, width: s.width || 2, d: d.trim() };
  });
  const bandPaths = bands.map(b => {
    const p = b.pts.slice().sort((a, c) => a.x - c.x);
    return { color: b.color, d: p.map((q, i) => `${i ? "L" : "M"}${X(q.x).toFixed(1)},${Y(q.hi).toFixed(1)}`).join(" ") + " " + p.slice().reverse().map(q => `L${X(q.x).toFixed(1)},${Y(q.lo).toFixed(1)}`).join(" ") + "Z" };
  });
  const dots = series.flatMap(s => (s.dots === false ? [] : s.pts.map(p => ({ x: X(p.x), y: Y(p.y), color: s.color, hollow: !!s.hollow, r: s.r || 3.5, title: p.t || "" }))));
  const xt = niceTicks(x0, x1, xTickMax).map(v => ({ x: X(v), label: xFmt(v) }));
  const yt = [0, 1, 2, 3].map(k => { const v = y0 + ((y1 - y0) * k) / 3; return { y: Y(v), label: v.toFixed(yDigits) }; });
  return { W, H, L, R, T, B, paths, bandPaths, dots, xt, yt };
}

/** 계산된 좌표를 SVG 문자열로 만든다(PDF용). 글자는 SVG에 넣지 않고 호출한 쪽이 HTML로 얹는다. */
export function svgString(g, { grid = "#e4e8f0", bg = "#fff" } = {}) {
  const lines = g.yt.map(t => `<line x1="${g.L}" x2="${g.W - g.R}" y1="${t.y.toFixed(1)}" y2="${t.y.toFixed(1)}" stroke="${grid}"/>`).join("");
  const bands = g.bandPaths.map(b => `<path d="${b.d}" fill="${b.color}"/>`).join("");
  const paths = g.paths.map(p => `<path d="${p.d}" fill="none" stroke="${p.color}" stroke-width="${p.width}"${p.dash ? ` stroke-dasharray="${p.dash}"` : ""} stroke-linejoin="round"/>`).join("");
  const dots = g.dots.map(d => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r}" fill="${d.hollow ? "#fff" : d.color}" stroke="${d.color}" stroke-width="1.6"/>`).join("");
  return `<svg viewBox="0 0 ${g.W} ${g.H}"><rect x="0" y="0" width="${g.W}" height="${g.H}" fill="${bg}" stroke="${grid}"/>${lines}${bands}${paths}${dots}</svg>`;
}
