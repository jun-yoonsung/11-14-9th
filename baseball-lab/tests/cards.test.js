import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCards, TORSO_RATIO, BANNED } from "../src/lib/cards.js";

const KEYS = ["stride_torso", "trunk_lean_deg", "knee_fp_deg", "knee_br_deg", "arm_angle_deg", "elbow_h_fp", "release_h_torso", "hip_shoulder_sep_deg", "trunk_rot_lag_ms", "pelvis_trunk_gap_ms", "trunk_arm_gap_ms", "fp_to_br_ms"];
const rng = { stride_torso: [1.8, 2.4], trunk_lean_deg: [15, 30], knee_fp_deg: [110, 140], knee_br_deg: [130, 165], arm_angle_deg: [80, 110], elbow_h_fp: [-0.2, 0.2], release_h_torso: [2.4, 2.8], hip_shoulder_sep_deg: [30, 55], trunk_rot_lag_ms: [40, 90], pelvis_trunk_gap_ms: [20, 60], trunk_arm_gap_ms: [30, 70], fp_to_br_ms: [120, 180] };
const imp = { stride_torso: 0.2, trunk_lean_deg: 0.1, knee_fp_deg: 0.05, knee_br_deg: 0.15, arm_angle_deg: 0.1, elbow_h_fp: 0.02, release_h_torso: 0.1, hip_shoulder_sep_deg: 0.05, trunk_rot_lag_ms: 0.1, pelvis_trunk_gap_ms: 0.05, trunk_arm_gap_ms: 0.04, fp_to_br_ms: 0.04 };
const mkRef = (rel = {}) => ({
  ref: Object.fromEntries(KEYS.map(k => { const [lo, hi] = rng[k], w = hi - lo; return [k, { p10: lo - w, p25: lo - w / 2, p50: (lo + hi) / 2, p75: hi + w / 2, p90: hi + w, target: [lo, hi], importance: imp[k] }]; })),
  reliability: Object.fromEntries(KEYS.map(k => [k, { side: "보통", front: "보통", back: "보통", broadcast: "보통", ...(rel[k] || {}) }])),
  kbo_release: { R: { z: { p10: 1.6, p25: 1.7, p50: 1.78, p75: 1.84, p90: 1.9 }, x: { p50: -0.5 }, n: 177 }, L: { z: { p10: 1.55, p25: 1.65, p50: 1.72, p75: 1.8, p90: 1.86 }, x: { p50: 0.6 }, n: 55 } },
});
const inTarget = () => Object.fromEntries(KEYS.map(k => [k, (rng[k][0] + rng[k][1]) / 2]));
const args = (over = {}, extra = {}) => ({ features: { ...inTarget(), ...over }, view: "side", hand: "R", heightCm: 180, ref: mkRef(), conf: "높음", ...extra });

test("side view makes no trunk_rot card (reliability 낮음)", () => {
  const r = buildCards(args({ trunk_rot_lag_ms: 200, stride_torso: 1.0, knee_br_deg: 100 }, { ref: mkRef({ trunk_rot_lag_ms: { side: "낮음" } }) }));
  assert.ok(!r.cards.some(c => c.key === "trunk_rot_lag_ms")); assert.ok(r.cards.length >= 1);
});
test("broadcast view makes no stride card", () => {
  const r = buildCards(args({ stride_torso: 1.0, knee_br_deg: 100 }, { view: "broadcast", ref: mkRef({ stride_torso: { broadcast: "낮음" } }) }));
  assert.ok(!r.cards.some(c => c.key === "stride_torso"));
});
test("low conf drops every card", () => {
  const r = buildCards(args({ stride_torso: 1.0 }, { conf: "낮음" }));
  assert.equal(r.cards.length, 0); assert.equal(r.message, "제안하기에 영상 정보가 부족합니다");
});
test("fewer than 2 valid candidates gives 부족 message", () => {
  const rel = Object.fromEntries(KEYS.map(k => [k, { side: "낮음" }])); rel.stride_torso = { side: "보통" };
  const r = buildCards(args({ stride_torso: 1.0 }, { ref: mkRef(rel) }));
  assert.equal(r.cards.length, 0); assert.equal(r.message, "제안하기에 영상 정보가 부족합니다");
});
test("all in target gives 참조 범위 안", () => {
  const r = buildCards(args());
  assert.equal(r.cards.length, 0); assert.equal(r.message, "참조 범위 안입니다");
});
test("top 3 by score and sorted", () => {
  const r = buildCards(args({ stride_torso: 1.0, knee_br_deg: 100, trunk_lean_deg: 45, arm_angle_deg: 60, trunk_rot_lag_ms: 200 }));
  assert.equal(r.cards.length, 3);
  assert.ok(r.cards[0].score >= r.cards[1].score && r.cards[1].score >= r.cards[2].score);
});
test("no kbo card without heightCm", () => {
  const r = buildCards(args({ release_h_torso: 1.5 }, { heightCm: null }));
  assert.ok(!r.cards.some(c => c.source === "kbo"));
});
test("kbo card appears with heightCm and release_h outside distribution", () => {
  assert.equal(TORSO_RATIO, 0.30);
  const r = buildCards(args({ release_h_torso: 2.0, stride_torso: 1.0, knee_br_deg: 100 }, { heightCm: 180 }));     // 2.0×0.30×1.8 = 1.08 m + 릴리스 보정 0.25 m = 1.33 m
  const k = r.cards.find(c => c.source === "kbo");
  assert.ok(k && /KBO/.test(k.target) && /1\.33/.test(k.mine));
});
test("no banned words in any template output", () => {
  const cases = [{ stride_torso: 1.0 }, { stride_torso: 3.0 }, { trunk_rot_lag_ms: 200 }, { trunk_rot_lag_ms: 5 }, { pelvis_trunk_gap_ms: 150 }, { pelvis_trunk_gap_ms: -20 }, { knee_fp_deg: 90 }, { knee_fp_deg: 170 }, { knee_br_deg: 100 },
    { arm_angle_deg: 40 }, { arm_angle_deg: 140 }, { trunk_lean_deg: 5 }, { trunk_lean_deg: 50 }, { release_h_torso: 1.5 }, { release_h_torso: 3.5 }];
  let n = 0;
  for (const o of cases) for (const hc of [null, 180]) {
    const r = buildCards(args({ ...o, knee_br_deg: 100, stride_torso: o.stride_torso ?? 1.0 }, { heightCm: hc }));
    for (const c of r.cards) { n++; for (const f of ["title", "mine", "target", "direction", "evidence", "caution", "sourceLabel"]) assert.ok(!BANNED.test(c[f]), `${f}: ${c[f]}`); }
    if (r.message) assert.ok(!BANNED.test(r.message));
  }
  assert.ok(n > 20);
});
test("every card has source label text", () => {
  const r = buildCards(args({ stride_torso: 1.0, knee_br_deg: 100, release_h_torso: 2.0 }));
  for (const c of r.cards) { assert.ok(c.sourceLabel.length > 3); assert.ok(["college", "kbo"].includes(c.source)); }
  assert.ok(r.cards.some(c => /모션캡처/.test(c.sourceLabel)));
});
test("left-handed uses mirrored features unchanged", () => {
  const a = buildCards(args({ stride_torso: 1.0, knee_br_deg: 100 })), b = buildCards(args({ stride_torso: 1.0, knee_br_deg: 100 }, { hand: "L" }));
  assert.deepEqual(a.cards.filter(c => c.source === "college").map(c => c.key), b.cards.filter(c => c.source === "college").map(c => c.key));
});
test("null feature values are skipped", () => {
  const r = buildCards(args({ stride_torso: null, trunk_rot_lag_ms: null, knee_br_deg: 100, trunk_lean_deg: 50 }));
  assert.ok(!r.cards.some(c => c.key === "stride_torso"));
});
