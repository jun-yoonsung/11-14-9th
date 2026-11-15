/* 화면 조각에 쓰는 작은 함수들 */
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const beadColor = p => (p >= 70 ? "#c8302a" : p <= 30 ? "#2f5bd3" : "#6f7a91");
export const topText = l => (l.pct == null ? "-" : `상위 ${100 - l.pct}%`);
export const dateKo = iso => { const d = new Date(iso); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
export const dateIso = iso => { const d = new Date(iso); const z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
export const BASE = import.meta.env.BASE_URL;
