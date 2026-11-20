/* 화면 조각에 쓰는 작은 함수들 */
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const beadColor = p => (p >= 70 ? "#c8302a" : p <= 30 ? "#2f5bd3" : "#6f7a91");
export const topText = l => (l.pct == null ? "-" : `상위 ${100 - l.pct}%`);
export const dateKo = iso => { const d = new Date(iso); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
export const dateIso = iso => { const d = new Date(iso); const z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
export const BASE = import.meta.env.BASE_URL;

/** 지표 한 줄 해설(코드가 계산값으로 만든 문장). AI 해설이 없는 지표나 선수에도 쓴다. */
export function metricNote(l) {
  if (l.value == null) return `${l.label}은 기록이 없어 평가하지 않았습니다.`;
  const abs = String(l.diffDisplay || "").replace(/^[+−-]/, "");
  const dir = String(l.diffDisplay || "").startsWith("+") ? "높고" : "낮고";
  const side = l.tone === "good" ? "좋은 쪽이며" : l.tone === "bad" ? "아쉬운 쪽이며" : "";
  const gap = l.tone === "even" ? `리그 평균(${l.leagueDisplay})과 같고` : `리그 평균(${l.leagueDisplay})보다 ${abs} ${dir} ${side}`.trim();
  const pos = l.pct == null ? "규정 미달이라 순위는 매기지 않았습니다." : `리그에서 ${topText(l)}${l.rank ? `(${l.rank}위)` : ""}에 해당합니다.`;
  return `${l.display}로 ${gap} ${pos}`.replace(/\s+/g, " ");
}
