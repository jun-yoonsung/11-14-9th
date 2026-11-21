/* 보고서(PDF) 디자인 토큰 — Impeccable 기준
 *  - 색은 OKLCH로 정의한다. 순수 검정·순수 회색은 쓰지 않고, 모든 중립색에 푸른 기운(hue 262)을 살짝 입힌다.
 *  - PDF를 그리는 html2canvas는 oklch()를 읽지 못하므로, 여기서 sRGB 16진수로 바꿔 CSS에 넣는다.
 *  - 기존 보고서 코드에 흩어진 16진수 색은 LEGACY 표로 한 번에 토큰으로 바꾼다(themed).
 *  - 글자 크기 단계(pt)와 본문 최대 폭도 여기서 정한다. tools/report-lint.mjs가 이 규칙을 검사한다. */

// OKLCH → sRGB 16진수
export function oklch(L, C, h) {
  const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  return "#" + lin.map(v => { v = Math.min(1, Math.max(0, v)); v = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; return Math.round(v * 255).toString(16).padStart(2, "0"); }).join("");
}

const H = 262;   // 중립색의 색조(푸른 기운)
export const TOKENS = {
  paper:   oklch(0.992, 0.004, H),   // 종이 바탕 (순백 대신)
  ink:     oklch(0.22, 0.032, H),    // 본문·제목 (순검정 대신)
  ink2:    oklch(0.36, 0.034, H),    // 보조 본문
  muted:   oklch(0.50, 0.034, H),    // 설명·단위 (종이 위 대비 5:1 이상)
  line:    oklch(0.89, 0.012, H),    // 표·구분선
  line2:   oklch(0.935, 0.009, H),   // 옅은 구분선
  fill:    oklch(0.962, 0.008, H),   // 옅은 면
  fill2:   oklch(0.945, 0.011, H),   // 막대 바탕
  mid:     oklch(0.70, 0.045, H),    // 강조하지 않는 막대
  accent:  oklch(0.46, 0.175, 264),  // 강조(파랑)
  accent2: oklch(0.58, 0.16, 264),
  accentBg: oklch(0.95, 0.025, 264), // 강조 바탕
  good:    oklch(0.49, 0.105, 158),  // 좋음(초록)
  bad:     oklch(0.53, 0.185, 27),   // 나쁨(빨강)
  warn:    oklch(0.62, 0.12, 75),
  violet:  oklch(0.52, 0.15, 295),
  teal:    oklch(0.58, 0.09, 215),
};

// 글자 크기 단계(pt) — 1.2배 안팎 비율. 이보다 작은 글자는 쓰지 않는다.
export const SCALE = { title: 23, h1: 20, h2: 12.5, lead: 11, body: 10, small: 9, note: 8, min: 7.5 };
export const MEASURE = "152mm";   // 줄 길이 상한(한글 한 줄 약 45자)

// 기존 코드의 16진수 → 토큰. 순검정·순회색·순백은 모두 틴트 있는 토큰으로 바뀐다.
const T = TOKENS;
export const LEGACY = {
  "#ffffff": T.paper, "#fff": T.paper,
  "#121a2b": T.ink, "#101216": T.ink, "#111": T.ink, "#1a2b55": T.ink,
  "#2b3550": T.ink2, "#555": T.muted, "#5c667d": T.muted,
  "#d6dbe6": T.line, "#e4e8f0": T.line2, "#aab2c4": T.line, "#c9cfdc": T.line,
  "#eef1f6": T.fill2, "#eceff5": T.fill2, "#f7f8fb": T.fill, "#f3f5f9": T.fill,
  "#eaf0fc": T.accentBg, "#e3e8f9": T.accentBg,
  "#98a3bd": T.mid, "#8e96a6": T.mid,
  "#1d3fbb": T.accent, "#2f5bd3": T.accent2, "#4a68d8": T.accent2, "#5e6ad2": T.accent2,
  "#17734f": T.good, "#c8302a": T.bad, "#d0312d": T.bad,
  "#c9892b": T.warn, "#7a4fc2": T.violet, "#2f9bb0": T.teal,
};

// 문자열 안의 옛 색을 토큰으로 바꾼다 (CSS·SVG·인라인 style 모두)
export function themed(s) {
  return s.replace(/#[0-9a-fA-F]{3,6}\b/g, m => LEGACY[m.toLowerCase()] || m);
}

// 기존 CSS 뒤에 덧붙여 규칙을 바로잡는 덮어쓰기: 글자 단계·줄 길이·표 숫자·옅은 구분
export const OVERRIDES = `
  .rp { background: ${T.paper}; font-feature-settings: "tnum" 1; }
  .rp-page { background: ${T.paper}; }
  .rp-title { font-size: ${SCALE.title}pt; text-wrap: balance; }
  .rp-sec h2 { font-size: ${SCALE.h2}pt; letter-spacing: -0.005em; }
  .rp-head, .rp-callout p, .rp-ai p, .rp-note, .rp-fine, .rp-sec > p { max-width: ${MEASURE}; }
  .rp li, .rp p { text-wrap: pretty; }
  .rp-kpi small, .rp th { font-size: ${SCALE.small}pt; }
  .rp-fine, .rp-pv, .rp-leg, .rp-leg2, .rp-scale { font-size: ${SCALE.note}pt; }
  .rp-top, .rp-foot { color: ${T.muted}; }
  .rp-bead { box-shadow: 0 0 0 0.3pt ${T.line}; }
`;
