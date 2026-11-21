/* 투구 폼 "조정 방향 카드". 처방이 아니라 참조 범위와 다른 정도를 보고 방향만 가리킨다.
 *  - 참조 1(college): OpenBiomechanics 모션캡처 투수 중 구속 상위 1/3의 가운데 50% 범위 (대학·독립·고교·마이너 섞임)
 *  - 참조 2(kbo): 2026 KBO 투수 평균 릴리스 높이 분포 — 키를 입력했을 때만
 *  - 신뢰도가 "낮음"인 지표(시점별)와 영상 신뢰도가 낮은 경우는 카드를 만들지 않는다. 문구는 고정 템플릿. */
import { predictSpeed } from "./formModel.js";

export const TORSO_RATIO = 0.30;          // 몸통 길이 ≈ 키 × 0.30 (내 판단: 어깨 중점~골반 중점)
export const RELEASE_OFFSET_M = 0.25;     // 손목 관절 높이 → 공이 손을 떠나는 높이 보정: 발목 관절~바닥 약 0.08m + 손목~공 약 0.17m (가정)
export const BANNED = /고치세요|해야 합니다|부상|통증|위험|훈련|치료|점수/;
export const MIN_DEV = 0.3;               // 참조 범위에서 벗어난 정도가 범위 폭의 0.3배 미만이면 "범위 안"으로 본다(잡음 수준의 차이로 카드를 만들지 않음)
export const MSG_LACK = "제안하기에 영상 정보가 부족합니다", MSG_IN = "참조 범위 안입니다";
const SRC = { college: "모션캡처 참조(OpenBiomechanics 대학·독립·고교·마이너, 구속 상위 1/3)", kbo: "KBO 2026 투수 릴리스 참조" };
const CAUTION = "영상으로 추정한 3D라 오차가 있고, 참조는 체격·수준이 다른 집단이라 모든 선수에게 맞는 것은 아닙니다. 방향을 가리킬 뿐 처방이 아닙니다.";

const fmt = { torso: v => `${v.toFixed(2)} 몸통 길이`, deg: v => `${v.toFixed(0)}°`, ms: v => `${Math.round(v)} ms`, m: v => `${v.toFixed(2)} m` };
// 템플릿: [낮은 쪽 제목, 높은 쪽 제목], [낮은 쪽 방향, 높은 쪽 방향]
const T = {
  stride_torso: { unit: "torso", what: "착지 때 두 발 사이 앞뒤 거리", title: ["스트라이드가 짧은 편", "스트라이드가 긴 편"], dir: ["앞발을 조금 더 멀리 내딛는 쪽으로 조정을 살펴볼 수 있습니다.", "앞발을 조금 덜 멀리 내딛는 쪽으로 조정을 살펴볼 수 있습니다."] },
  trunk_rot_lag_ms: { unit: "ms", what: "앞발 착지부터 몸통 회전 최고 속도까지 시간", title: ["몸통이 일찍 도는 편", "몸통 회전이 늦은 편"], dir: ["착지 직후 몸통이 너무 일찍 열리지 않는지 살펴볼 수 있습니다.", "착지 뒤 몸통이 더 일찍 돌기 시작하는 쪽으로 조정을 살펴볼 수 있습니다."] },
  pelvis_trunk_gap_ms: { unit: "ms", what: "골반 회전 최고 속도 뒤 몸통 회전 최고 속도까지 시간", title: ["골반과 몸통이 거의 함께 도는 편", "골반과 몸통 사이 시차가 긴 편"], dir: ["골반이 먼저 돌고 몸통이 이어 도는 시차를 조금 더 두는 쪽으로 살펴볼 수 있습니다.", "골반과 몸통이 도는 시차를 조금 줄이는 쪽으로 살펴볼 수 있습니다."] },
  knee_fp_deg: { unit: "deg", what: "착지 때 앞무릎 각도", when: "착지 때", title: ["착지 때 앞무릎이 많이 굽은 편", "착지 때 앞무릎이 펴진 편"], dir: ["앞다리를 조금 더 단단히 받치는 쪽으로 살펴볼 수 있습니다.", "앞무릎을 조금 더 굽혀 받치는 쪽으로 살펴볼 수 있습니다."] },
  knee_br_deg: { unit: "deg", what: "릴리스 때 앞무릎 각도", when: "릴리스 때", title: ["릴리스 때 앞무릎이 많이 굽은 편", "릴리스 때 앞무릎이 펴진 편"], dir: ["앞다리가 릴리스까지 버티는지 살펴볼 수 있습니다.", "앞무릎을 릴리스 때 조금 더 굽혀 받치는 쪽으로 살펴볼 수 있습니다."] },
  arm_angle_deg: { unit: "deg", what: "릴리스 때 위팔이 아래 방향과 이루는 각(90°는 수평)", title: ["팔이 낮은 편", "팔이 높은 편"], dir: ["팔꿈치를 어깨 높이 쪽으로 조금 더 들어 올리는 쪽으로 살펴볼 수 있습니다.", "팔꿈치를 어깨 높이 쪽으로 조금 낮추는 쪽으로 살펴볼 수 있습니다."] },
  trunk_lean_deg: { unit: "deg", what: "릴리스 때 몸통이 수직에서 기운 각도", title: ["몸통이 곧게 선 편", "몸통이 많이 기운 편"], dir: ["릴리스 때 몸통을 조금 더 앞으로 기울이는 쪽으로 살펴볼 수 있습니다.", "릴리스 때 몸통 기울기를 조금 줄이는 쪽으로 살펴볼 수 있습니다."] },
  release_h_torso: { unit: "torso", what: "릴리스 때 손목 높이(몸통 길이 단위)", title: ["릴리스 지점이 낮은 편", "릴리스 지점이 높은 편"], dir: ["공을 놓는 지점을 조금 더 높이는 쪽으로 살펴볼 수 있습니다.", "공을 놓는 지점을 조금 낮추는 쪽으로 살펴볼 수 있습니다."] },
};
const iqrOf = r => Math.max(r.p75 - r.p25, 1e-9);

/** @returns {{cards:Card[], message:string|null, speed:{mph:number,rmse:number|null}|null}} */
export function buildCards({ features, view, hand, heightCm, ref, conf, model = null }) {
  const speed = model ? predictSpeed(model, view, features) : null;
  const relOf = k => ref.reliability?.[k]?.[view] ?? "낮음";
  const valid = Object.keys(T).filter(k => features[k] != null && Number.isFinite(features[k]) && ref.ref[k] && relOf(k) !== "낮음");
  if (conf === "낮음" || valid.length < 2) return { cards: [], message: MSG_LACK, speed };
  const cards = [];
  for (const k of valid) {
    const r = ref.ref[k], v = features[k], [lo, hi] = r.target;
    if (v >= lo && v <= hi) continue;
    const side = v < lo ? 0 : 1, dev = (side === 0 ? lo - v : v - hi) / iqrOf(r), t = T[k];
    if (dev < MIN_DEV) continue;
    cards.push({ key: k, title: t.title[side], mine: `내 값 ${fmt[t.unit](v)} (${t.what})`, target: `참조 범위 ${fmt[t.unit](lo)} ~ ${fmt[t.unit](hi)}`,
      direction: t.dir[side], evidence: `참조 범위에서 벗어난 정도는 일반 범위 폭의 ${dev.toFixed(1)}배이고, 구속과의 연관 비중은 ${Math.round(r.importance * 100)}%입니다.`,
      caution: CAUTION, source: "college", sourceLabel: SRC.college, confidence: relOf(k), score: dev * r.importance });
  }
  // KBO 릴리스 높이: 키를 입력했고 릴리스 높이를 믿을 수 있을 때
  const rk = "release_h_torso";
  if (heightCm && valid.includes(rk) && ref.kbo_release?.[hand]) {
    const z = ref.kbo_release[hand].z, m = (features[rk] * TORSO_RATIO * heightCm) / 100 + RELEASE_OFFSET_M;
    if (m < z.p10 || m > z.p90) {
      const side = m < z.p10 ? 0 : 1, dev = (side === 0 ? z.p10 - m : m - z.p90) / Math.max(z.p90 - z.p10, 1e-9);
      cards.push({ key: rk, title: side === 0 ? "릴리스 높이가 KBO 투수 범위보다 낮은 편" : "릴리스 높이가 KBO 투수 범위보다 높은 편",
        mine: `내 릴리스 높이 약 ${fmt.m(m)} (입력한 키 ${heightCm}cm로 환산한 추정)`, target: `KBO 2026 ${hand === "L" ? "좌" : "우"}투 ${ref.kbo_release[hand].n}명의 10~90% 범위 ${fmt.m(z.p10)} ~ ${fmt.m(z.p90)}`,
        direction: T[rk].dir[side], evidence: `KBO 범위에서 벗어난 정도는 범위 폭의 ${dev.toFixed(1)}배입니다. 몸통 길이는 키의 ${Math.round(TORSO_RATIO * 100)}%로 가정했습니다.`,
        caution: CAUTION, source: "kbo", sourceLabel: SRC.kbo, confidence: relOf(rk), score: dev * ref.ref[rk].importance });
    }
  }
  cards.sort((a, b) => b.score - a.score);
  return { cards: cards.slice(0, 3), message: cards.length ? null : MSG_IN, speed };
}
