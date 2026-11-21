import { test } from "node:test";
import assert from "node:assert/strict";
import { JOINTS } from "../src/lib/form.js";
import { angleSeries, jointUse, sequence } from "../src/lib/formUse.js";

/** 합성: 던지는 팔꿈치가 90°→170°로 펴지고, 골반(t=0.4)→어깨선(t=0.5)→손목 최고속도(t=0.7) 순서로 */
function synth(fps = 30, T = 1.2) {
  const out = [];
  for (let i = 0; i <= T * fps; i++) {
    const t = i / fps, sig = c => 1 / (1 + Math.exp(-(t - c) / 0.04));
    const pel = (Math.PI * (1 - 0.5 * sig(0.4))), sho = (Math.PI * (1 - 0.6 * sig(0.5))), el = (90 + 80 * sig(0.62)) * Math.PI / 180;
    const j = Object.fromEntries(JOINTS.map(n => [n, { x: 0, y: 1, z: 0, v: 1 }]));
    j.rhip = { x: 0.15 * Math.cos(pel), y: 1, z: 0.15 * Math.sin(pel) }; j.lhip = { x: -j.rhip.x, y: 1, z: -j.rhip.z };
    j.rsho = { x: 0.2 * Math.cos(sho), y: 1.5, z: 0.2 * Math.sin(sho) }; j.lsho = { x: -j.rsho.x, y: 1.5, z: -j.rsho.z };
    j.relb = { x: j.rsho.x + 0.3, y: j.rsho.y, z: j.rsho.z }; j.rwri = { x: j.relb.x + 0.3 * Math.cos(Math.PI - el), y: j.relb.y + 0.3 * Math.sin(Math.PI - el), z: j.relb.z };
    j.lkne = { x: 0.1, y: 0.55, z: -0.15 }; j.lank = { x: 0.1, y: 0.1, z: -0.15 }; j.lhip = { ...j.lhip, y: 1 };
    out.push({ t, j });
  }
  return out;
}

test("angleSeries returns equal-length arrays and elbow opens from ~90 to ~170", () => {
  const f = synth(), s = angleSeries(f);
  for (const k of ["elbow", "kneeL", "kneeR", "shoulderYaw", "pelvisYaw", "lean", "wrist"]) assert.equal(s[k].length, f.length);
  assert.ok(Math.abs(s.elbow[0] - 90) < 3 && Math.abs(s.elbow.at(-1) - 170) < 3);
});
test("jointUse reports elbow range about 80 degrees and a positive peak speed", () => {
  const u = jointUse(synth(), 0.1, 0.9), el = u.find(r => r.key === "elbow");
  assert.ok(el.range > 60 && el.range < 100, el.range); assert.ok(el.peakDps > 100);
  assert.equal(u.length, 6);
});
test("sequence orders pelvis before trunk before arm", () => {
  const q = sequence(synth(), 0.2, 0.9);
  assert.equal(q.steps.length, 4);
  const at = k => q.steps.findIndex(s => s.key === k);
  assert.ok(at("pelvis") < at("trunk"));
});
test("sequence and jointUse are empty for too few frames, lost frames are skipped", () => {
  assert.deepEqual(jointUse(synth().slice(0, 2), 0, 1), []);
  assert.equal(sequence(synth().slice(0, 2), 0, 1).steps.length, 0);
  const f = synth(); f[4] = { t: f[4].t, j: null };
  assert.equal(angleSeries(f).t.length, f.length - 1);
});
