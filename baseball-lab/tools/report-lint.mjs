// 보고서 디자인 검사 (Impeccable 기준) — `node tools/report-lint.mjs`
// 1) 보고서 소스에 남은 순검정·순백·순회색 16진수  2) 너무 작은 글자  3) 장식 그라데이션·그림자  4) 토큰 색 대비(WCAG)
import { readFileSync } from "node:fs";
import { TOKENS, SCALE, LEGACY } from "../src/lib/reportTheme.js";

const src = ["report.js", "reportForm.js"].map(f => readFileSync(new URL(`../src/lib/${f}`, import.meta.url), "utf8")).join("\n");
const bad = [];

// 1) 중립색: R=G=B 인 16진수는 순회색. LEGACY 표가 토큰으로 바꿔 주므로 "표에 없는" 것만 오류.
for (const m of src.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)) {
  const h = m[0].toLowerCase(), x = h.length === 4 ? h.slice(1).split("").map(c => c + c) : h.slice(1).match(/../g);
  const gray = x[0] === x[1] && x[1] === x[2];
  if (gray && !LEGACY[h]) bad.push(`순회색/순흑백 ${h} — reportTheme.js의 LEGACY 또는 토큰으로 옮기세요`);
}
// 2) 글자 크기
for (const m of src.matchAll(/font-size:\s*([\d.]+)pt/g)) if (+m[1] < SCALE.min - 0.01) bad.push(`글자 ${m[1]}pt — 최소 ${SCALE.min}pt`);
// 3) 장식
const grad = (src.match(/gradient\(/g) || []).length;
if (grad > 1) bad.push(`그라데이션 ${grad}개 — 데이터를 뜻하는 1개(백분위 띠)만 허용`);
if (/glow|bounce|elastic/i.test(src)) bad.push("glow/bounce/elastic 사용");
if ((src.match(/box-shadow/g) || []).length > 2) bad.push("box-shadow 3개 이상 — 그림자로 장식하지 마세요");

// 4) 대비
const lum = h => { const [r, g, b] = h.slice(1).match(/../g).map(x => { const v = parseInt(x, 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const PAIRS = [["ink", "paper", 7], ["ink2", "paper", 7], ["muted", "paper", 4.5], ["muted", "fill", 4.5], ["accent", "paper", 4.5], ["good", "paper", 4.5], ["bad", "paper", 4.5], ["paper", "accent", 4.5]];
const rows = PAIRS.map(([f, b, min]) => { const r = cr(TOKENS[f], TOKENS[b]); if (r < min) bad.push(`대비 ${f}/${b} ${r.toFixed(2)} < ${min}`); return `${f.padEnd(7)} on ${b.padEnd(7)} ${r.toFixed(2)}:1`; });

console.log("토큰 대비\n  " + rows.join("\n  "));
if (bad.length) { console.log("\n문제 " + bad.length + "건\n- " + bad.join("\n- ")); process.exit(1); }
console.log("\n보고서 디자인 검사 통과");
