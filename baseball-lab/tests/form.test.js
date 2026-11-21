import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JOINTS, MP_INDEX, toFrame, align, findEvents, features3d, confidence, boneCheck } from "../src/lib/form.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/form_parity.json", import.meta.url), "utf8"));
const framesOf = (J, t) => t.map((tt, i) => ({ t: tt, j: Object.fromEntries(JOINTS.map(n => [n, { x: J[n][i][0], y: J[n][i][1], z: J[n][i][2], v: 1 }])) }));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test("align matches python on every fixture case", () => {
  for (const c of FX) {
    const out = align(framesOf(c.raw, c.t), c.hand);
    out.forEach((f, i) => JOINTS.forEach(n => {
      near(f.j[n].x, c.aligned[n][i][0], 1e-4, `${c.name} ${n}.x`);
      near(f.j[n].y, c.aligned[n][i][1], 1e-4, `${c.name} ${n}.y`);
      near(f.j[n].z, c.aligned[n][i][2], 1e-4, `${c.name} ${n}.z`);
    }));
  }
});

test("parity: findEvents indices equal python on every fixture case", () => {
  for (const c of FX) assert.deepEqual(findEvents(framesOf(c.aligned, c.t)), c.events, c.name);
});

test("parity: features3d equals python within tolerance (length 1e-3, angle 0.1deg, time 1ms)", () => {
  for (const c of FX) {
    const f = features3d(framesOf(c.aligned, c.t));
    for (const [k, v] of Object.entries(c.features)) {
      if (v === null) assert.equal(f[k], null, `${c.name} ${k}`);
      else near(f[k], v, k.endsWith("_ms") ? 1 : k.endsWith("_deg") ? 0.1 : 1e-3, `${c.name} ${k}`);
    }
  }
});

test("toFrame flips y and maps landmarks 11..28 to 12 joints", () => {
  const world = Array.from({ length: 33 }, (_, i) => ({ x: i, y: 10 + i, z: 20 + i, visibility: 0.5 }));
  const f = toFrame(1.5, world);
  assert.equal(f.t, 1.5);
  assert.deepEqual(Object.keys(f.j), JOINTS);
  assert.equal(f.j.lsho.x, 11); assert.equal(f.j.lsho.y, -(10 + 11)); assert.equal(f.j.lsho.z, -(20 + 11)); assert.equal(f.j.rank.x, 28);
  assert.equal(f.j.rank.v, 0.5); assert.equal(MP_INDEX.rank, 28);
});

test("align makes pitching direction +x and mirrors left-handed", () => {
  const c = FX.find(x => x.hand === "L");
  const a = align(framesOf(c.raw, c.t), "L");
  const d = a.map(f => [f.j.lank.x - f.j.rank.x, f.j.lank.z - f.j.rank.z]);
  const i = d.map(([x, z]) => Math.hypot(x, z)).reduce((m, v, k, arr) => (v > arr[m] ? k : m), 0);
  assert.ok(Math.abs(Math.atan2(d[i][1], d[i][0])) < 0.02);
});

test("null frames are skipped without throwing", () => {
  const c = FX[0];
  const fr = framesOf(c.aligned, c.t); fr[3] = { t: fr[3].t, j: null }; fr[10] = { t: fr[10].t, j: null };
  const ev = findEvents(fr);
  assert.ok(ev.br === null || Number.isInteger(ev.br));
  assert.ok(features3d(fr) && typeof features3d(fr) === "object");
});

test("confidence is 낮음 when under 70% frames valid", () => {
  const c = FX[0], fr = framesOf(c.aligned, c.t);
  const bad = fr.map((f, i) => (i % 2 ? { t: f.t, j: null } : f));
  assert.equal(confidence(bad, findEvents(fr)), "낮음");
  assert.ok(["높음", "보통"].includes(confidence(fr, findEvents(fr))));
});

test("boneCheck flags stretched limbs", () => {
  const c = FX.find(x => x.name === "real_clean_R"), fr = framesOf(c.aligned, c.t);
  assert.equal(boneCheck(fr).ok, true);
  const stretched = fr.map((f, i) => (i % 2 ? { t: f.t, j: { ...f.j, relb: { ...f.j.relb, x: f.j.relb.x + 1.5 } } } : f));
  assert.equal(boneCheck(stretched).ok, false);
});
