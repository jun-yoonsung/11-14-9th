/* 투수 역할(선발/구원) 기준: 선발과 불펜은 던지는 이닝과 역할이 달라 서로 비교하지 않고 같은 역할끼리 비교한다 */
export const RELIEF_QUAL_OUTS = 90;                          // 불펜 기준: 30이닝 이상 (선발은 meta의 규정 이닝)
export const ROLE_MIN_OUTS = { 선발: 180, 구원: 90 };          // 비슷한 선수 찾기에서 쓰는 최소 이닝(아웃 수)
export const roleLabel = pos => (pos === "구원" ? "불펜 투수" : pos === "선발" ? "선발 투수" : "투수");   // 과거 시즌은 보직 기록이 없어 그냥 "투수"
export const pitcherQual = (s, q) => s.outs >= (s.pos === "구원" ? RELIEF_QUAL_OUTS : q.pitcherOuts);
export const pitcherQualText = (q, pos) => `${Math.round((pos === "구원" ? RELIEF_QUAL_OUTS : q.pitcherOuts) / 3)}이닝 이상`;
