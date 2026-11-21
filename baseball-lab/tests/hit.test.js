import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JOINTS, align } from "../src/lib/form.js";
import { HIT_KEYS, findEventsHit, featuresHit } from "../src/lib/hit.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/hit_parity.json", import.meta.url), "utf8"));
const framesOf = (J, t) => t.map((tt, i) => ({ t: tt, j: Object.fromEntries(JOINTS.map(n => [n, { x: J[n][i][0], y: J[n][i][1], z: J[n][i][2], v: 1 }])) }));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test("hit parity: align matches python (left-handed hitters mirrored)", () => {
  for (const c of FX) align(framesOf(c.raw, c.t), c.hand).forEach((f, i) => JOINTS.forEach(n => ["x", "y", "z"].forEach((ax, k) => near(f.j[n][ax], c.aligned[n][i][k], 1e-4, `${c.name} ${n}.${ax}`))));
});
test("hit parity: findEventsHit indices equal python", () => {
  for (const c of FX) { const e = findEventsHit(framesOf(c.aligned, c.t)); assert.deepEqual({ lift: e.lift, fp: e.fp, ct: e.br }, c.events, c.name); }
});
test("hit parity: featuresHit equals python (length 1e-3, angle 0.1deg, time 1ms)", () => {
  for (const c of FX) {
    const f = featuresHit(framesOf(c.aligned, c.t));
    assert.deepEqual(Object.keys(f), HIT_KEYS);
    for (const [k, v] of Object.entries(c.features)) {
      if (v === null) assert.equal(f[k], null, `${c.name} ${k}`);
      else near(f[k], v, k.endsWith("_ms") ? 1 : k.endsWith("_deg") ? 0.1 : 1e-3, `${c.name} ${k}`);
    }
  }
});
test("hit: too short or empty clip yields no events and all-null features", () => {
  const c = FX[0], few = framesOf(c.aligned, c.t).slice(0, 6);
  assert.deepEqual(findEventsHit(few), { lift: null, fp: null, br: null });
  assert.ok(Object.values(featuresHit(few)).every(v => v === null));
});
