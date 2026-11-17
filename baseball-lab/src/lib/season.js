/* 시즌별 차이: 최신 시즌(2026)은 투구별 기록까지 있고, 과거 시즌(1982~2025)은 공식 시즌 기록만 있다 */

/** 그 시즌의 규정(타석·아웃 수). 최신 시즌은 meta.qualify, 과거 시즌은 meta.seasonInfo */
export function qualFor(meta, season) {
  if (season === meta.seasons[0]) return meta.qualify;
  const i = meta.seasonInfo && meta.seasonInfo[season];
  return i ? { batterPa: i.batterPa, pitcherOuts: i.pitcherOuts } : meta.qualify;
}
export const isHist = (meta, season) => season !== meta.seasons[0];
/** 팀 이름: 현재 팀은 meta.teams, 과거에 있던 팀(OB, MBC 등)은 meta.teamNames */
export const teamLabel = (meta, id) => ((meta.teams || []).find(t => t.id === id) || {}).name || (meta.teamNames || {})[id] || id;

/** 과거 시즌에서 계산할 수 있는 지표만 남긴다: 공식 시즌 기록 열만 있는 가짜 행으로 계산해 숫자가 나오는 지표 */
const PROBE = {
  batter: { g: 7, pa: 7, ab: 7, h: 7, d2: 7, d3: 7, hr: 7, rbi: 7, r: 7, bb: 7, hbp: 7, so: 7, sf: 7, sb: 7 },
  pitcher: { g: 7, outs: 21, h: 7, bb: 7, hbp: 7, so: 7, hr: 7, er: 7, r: 7 },
  team: { g: 7, w: 4, l: 3, d: 0, rs: 9, ra: 8 },
};
export function usableDefs(type, defs) {
  const probe = PROBE[type];
  return defs.filter(d => { try { const v = d.calc(probe); return typeof v === "number" && Number.isFinite(v); } catch (e) { return false; } });
}
