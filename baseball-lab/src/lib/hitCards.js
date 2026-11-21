/* 타격 자세 "조정 방향 카드". 처방이 아니라 참조 범위와 다른 정도를 보고 방향만 가리킨다.
 *  - 참조: OpenBiomechanics 모션캡처 타자 중 배트 속도 상위 1/3의 가운데 50% 범위 (대학·독립·고교·마이너 섞임, 프로 기준이 아님)
 *  - 신뢰도 "낮음"인 지표(시점별)와 영상 신뢰도가 낮은 경우는 카드를 만들지 않는다. 문구는 고정 템플릿.
 *  - 이 12개 지표만으로는 배트 속도를 거의 맞히지 못했으므로(ref.meta.speed_sd 참고) 지표 중요도로 순서를 매기지 않고, 참조 범위에서 벗어난 정도만으로 정한다. */
import { MSG_LACK, MSG_IN, MIN_DEV } from "./cards.js";
import { predictSpeed } from "./formModel.js";

const SRC = "모션캡처 참조(OpenBiomechanics 대학·독립·고교·마이너 타자, 배트 속도 상위 1/3)";
const CAUTION = "영상으로 추정한 3D라 오차가 있고, 참조는 체격·수준이 다른 집단이라 모든 선수에게 맞는 것은 아닙니다. 방향을 가리킬 뿐 처방이 아닙니다.";
const fmt = { torso: v => `${v.toFixed(2)} 몸통 길이`, deg: v => `${v.toFixed(0)}°`, ms: v => `${Math.round(v)} ms` };
const T = {
  stride_torso: { unit: "torso", what: "착지 때 두 발 사이 거리가 늘어난 정도", title: ["스트라이드가 짧은 편", "스트라이드가 긴 편"], dir: ["앞발을 조금 더 멀리 내디디는 쪽으로 살펴볼 수 있습니다.", "앞발을 조금 덜 멀리 내디디는 쪽으로 살펴볼 수 있습니다."] },
  knee_fp_deg: { unit: "deg", what: "착지 때 앞무릎 각도", title: ["착지 때 앞무릎이 많이 굽은 편", "착지 때 앞무릎이 펴진 편"], dir: ["앞다리를 조금 더 단단히 받치는 쪽으로 살펴볼 수 있습니다.", "착지 때 앞무릎을 조금 더 굽혀 받치는 쪽으로 살펴볼 수 있습니다."] },
  knee_ct_deg: { unit: "deg", what: "타격 순간 앞무릎 각도", title: ["타격 순간 앞무릎이 많이 굽은 편", "타격 순간 앞무릎이 펴진 편"], dir: ["앞다리가 타격 순간에 더 단단히 버티는지 살펴볼 수 있습니다.", "앞무릎을 타격 순간에 조금 더 굽혀 받치는 쪽으로 살펴볼 수 있습니다."] },
  hip_shoulder_sep_deg: { unit: "deg", what: "골반선과 어깨선의 최대 비틀림", title: ["골반과 어깨 비틀림이 작은 편", "골반과 어깨 비틀림이 큰 편"], dir: ["착지 전후로 골반과 어깨 사이 비틀림을 조금 더 만드는 쪽으로 살펴볼 수 있습니다.", "골반과 어깨 사이 비틀림을 조금 줄이는 쪽으로 살펴볼 수 있습니다."] },
  pelvis_rot_deg: { unit: "deg", what: "착지부터 타격 순간까지 골반선이 돈 각도", title: ["골반이 덜 도는 편", "골반이 많이 도는 편"], dir: ["골반을 조금 더 돌리는 쪽으로 살펴볼 수 있습니다.", "골반이 도는 폭을 조금 줄이는 쪽으로 살펴볼 수 있습니다."] },
  trunk_rot_deg: { unit: "deg", what: "착지부터 타격 순간까지 어깨선이 돈 각도", title: ["몸통이 덜 도는 편", "몸통이 많이 도는 편"], dir: ["몸통을 조금 더 돌리는 쪽으로 살펴볼 수 있습니다.", "몸통이 도는 폭을 조금 줄이는 쪽으로 살펴볼 수 있습니다."] },
  trunk_rot_lag_ms: { unit: "ms", what: "앞발 착지부터 몸통 회전 최고 속도까지 시간", title: ["몸통이 일찍 도는 편", "몸통 회전이 늦은 편"], dir: ["착지 직후 몸통이 너무 일찍 열리지 않는지 살펴볼 수 있습니다.", "착지 뒤 몸통이 더 일찍 돌기 시작하는 쪽으로 살펴볼 수 있습니다."] },
  pelvis_trunk_gap_ms: { unit: "ms", what: "골반 회전 최고 속도 뒤 몸통 회전 최고 속도까지 시간", title: ["골반과 몸통이 거의 함께 도는 편", "골반과 몸통 사이 시차가 긴 편"], dir: ["골반이 먼저 돌고 몸통이 이어 도는 시차를 조금 더 두는 쪽으로 살펴볼 수 있습니다.", "골반과 몸통이 도는 시차를 조금 줄이는 쪽으로 살펴볼 수 있습니다."] },
  trunk_lean_deg: { unit: "deg", what: "타격 순간 몸통이 수직에서 기운 각도", title: ["몸통이 곧게 선 편", "몸통이 많이 기운 편"], dir: ["타격 순간 몸통을 조금 더 기울이는 쪽으로 살펴볼 수 있습니다.", "타격 순간 몸통 기울기를 조금 줄이는 쪽으로 살펴볼 수 있습니다."] },
  fp_to_ct_ms: { unit: "ms", what: "앞발 착지부터 타격 순간까지 시간", title: ["착지 뒤 스윙이 빠른 편", "착지 뒤 스윙까지 시간이 긴 편"], dir: ["착지 뒤 스윙 시작을 조금 늦추는 쪽으로 살펴볼 수 있습니다.", "착지 뒤 스윙 시작을 조금 앞당기는 쪽으로 살펴볼 수 있습니다."] },
};
const iqrOf = r => Math.max(r.p75 - r.p25, 1e-9);

/** 배트 속도 모델이 쓸모 있는지: 교차검증 오차가 속도 표준편차의 95% 아래일 때만 구속 범위를 보여 준다 */
export function speedUseful(ref, view) {
  const b = ref.meta.best?.[view], r = ref.meta.models?.[view]?.[b]?.rmse;
  return r != null && ref.meta.speed_sd > 0 && r < 0.95 * ref.meta.speed_sd;
}

/** @returns {{cards:Card[], message:string|null, speed:{mph:number,rmse:number|null}|null}} */
export function buildHitCards({ features, view, ref, conf, model = null }) {
  const speed = model && speedUseful(ref, view) ? predictSpeed(model, view, features) : null;
  const relOf = k => ref.reliability?.[k]?.[view] ?? "낮음";
  const valid = Object.keys(T).filter(k => features[k] != null && Number.isFinite(features[k]) && ref.ref[k] && relOf(k) !== "낮음");
  if (conf === "낮음" || valid.length < 1) return { cards: [], message: MSG_LACK, speed };
  const cards = [];
  for (const k of valid) {
    const r = ref.ref[k], v = features[k], [lo, hi] = r.target;
    if (v >= lo && v <= hi) continue;
    const side = v < lo ? 0 : 1, dev = (side === 0 ? lo - v : v - hi) / iqrOf(r), t = T[k];
    if (dev < MIN_DEV) continue;
    cards.push({ key: k, title: t.title[side], mine: `내 값 ${fmt[t.unit](v)} (${t.what})`, target: `참조 범위 ${fmt[t.unit](lo)} ~ ${fmt[t.unit](hi)}`,
      direction: t.dir[side], evidence: `참조 범위에서 벗어난 정도는 일반 범위 폭의 ${dev.toFixed(1)}배입니다. 이 지표들만으로는 배트 속도를 거의 설명하지 못해서(연구 한계), 방향의 근거가 약합니다.`,
      caution: CAUTION, source: "college", sourceLabel: SRC, confidence: relOf(k), score: dev });
  }
  cards.sort((a, b) => b.score - a.score);
  return { cards: cards.slice(0, 3), message: cards.length ? null : MSG_IN, speed };
}
