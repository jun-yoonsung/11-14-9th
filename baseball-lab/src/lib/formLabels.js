/* 투구 폼·타격 자세 화면과 PDF가 같이 쓰는 문구 (종목별). 화면(FormSummary)과 PDF(reportForm)가 어긋나지 않도록 한 곳에 둔다. */
const d0 = v => `${v.toFixed(0)}°`, ms = v => `${Math.round(v)} ms`, tor = v => `${v.toFixed(2)} 몸통 길이`;
const PITCH = [["stride_torso", "스트라이드(착지 때 앞뒤 거리)", tor], ["trunk_lean_deg", "릴리스 때 몸통 기울기", d0], ["knee_fp_deg", "착지 때 앞무릎 각도", d0], ["knee_br_deg", "릴리스 때 앞무릎 각도", d0],
  ["arm_angle_deg", "릴리스 때 팔 각도", d0], ["hip_shoulder_sep_deg", "골반·어깨 최대 비틀림", d0], ["trunk_rot_lag_ms", "착지→몸통 회전 최고", ms], ["pelvis_trunk_gap_ms", "골반→몸통 시차", ms],
  ["trunk_arm_gap_ms", "몸통→릴리스 시차", ms], ["fp_to_br_ms", "착지→릴리스", ms]];
const HIT = [["stride_torso", "스트라이드(앞발을 내디딘 거리)", tor], ["trunk_lean_deg", "타격 순간 몸통 기울기", d0], ["knee_fp_deg", "착지 때 앞무릎 각도", d0], ["knee_ct_deg", "타격 순간 앞무릎 각도", d0],
  ["hip_shoulder_sep_deg", "골반·어깨 최대 비틀림", d0], ["pelvis_rot_deg", "착지→타격 골반 회전 각도", d0], ["trunk_rot_deg", "착지→타격 어깨선 회전 각도", d0], ["trunk_rot_lag_ms", "착지→몸통 회전 최고", ms],
  ["pelvis_trunk_gap_ms", "골반→몸통 시차", ms], ["trunk_hands_gap_ms", "몸통→타격 시차", ms], ["fp_to_ct_ms", "착지→타격", ms], ["hands_reach_torso", "타격 순간 손 위치(골반 앞쪽 거리)", tor]];

/** @param {string} sport "pitching" | "hitting" */
export const labelsOf = sport => (sport === "hitting" ? HIT : PITCH);
export const isHit = rec => (rec?.result?.sport ?? rec?.type) === "hitting";
export const T = sport => (sport === "hitting"
  ? { name: "타격 자세", person: "타자", hand: s => (s === "L" ? "좌타자" : "우타자"), end: "타격 순간", armLine: "파란 선이 뒤쪽(타석 뒤) 팔이에요.", seqHint: "보통 골반 → 몸통 → 팔 → 손 순서로 이어질수록 힘이 잘 전달된다고 알려져 있어요.",
      grp: "배트 속도", fileName: "타격자세_영상분석", ref: "타자 스윙", start: "앞발 들기" }
  : { name: "투구 폼", person: "투수", hand: s => (s === "L" ? "왼손 투수" : "오른손 투수"), end: "릴리스", armLine: "파란 선이 던지는 팔이에요.", seqHint: "보통 골반 → 몸통 → 팔 → 손목 순서로 이어질수록 힘이 잘 전달된다고 알려져 있어요.",
      grp: "구속", fileName: "투구폼_영상분석", ref: "투구", start: "발 들기" });

/** 분석 신뢰도가 "낮음"일 때 보여 줄 이유 목록. 실제 영상(저각도·몸 일부가 잘린 스톡 영상)에서 이유 없이 "낮음"만 나오던 것을 보완 */
export function lowReasons(r) {
  if (!r || r.conf !== "낮음") return [];
  const tx = T(r.sport), out = [];
  if (r.bone && r.bone.ok === false) out.push(`관절 사이 길이가 프레임마다 많이 달라 3D 추정이 불안정해요(흔들림 ${r.bone.cv != null && isFinite(r.bone.cv) ? r.bone.cv.toFixed(2) : "측정 불가"}, 한계 0.15). 카메라가 움직이거나, 몸 일부가 화면 밖이거나 가려졌을 수 있어요.`);
  if (r.events?.fp == null && r.sport !== "hitting") out.push("앞발 착지를 찾지 못했어요. 앞발이 앞으로 뚜렷이 뻗지 않았거나, 발이 화면 밖이거나 가려졌을 수 있어요.");
  if (r.events?.br == null) out.push(`${tx.end}를 찾지 못했어요. 동작이 구간 안에 다 들어오게 막대를 맞춰 보세요.`);
  if (!out.length) out.push("영상 속 사람이 자주 가려지거나 관절 인식 신뢰도가 낮았어요. 전신이 보이고 카메라가 고정된 영상이 가장 잘 맞아요.");
  return out;
}
