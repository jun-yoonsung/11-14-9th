import { test } from "node:test";
import assert from "node:assert/strict";
import { project, CAMS, boundsOf, skeletonShapes, skeletonSvg } from "../src/lib/skel.js";
import { JOINTS } from "../src/lib/form.js";

const J = Object.fromEntries(JOINTS.map((n, i) => [n, [i * 0.1, 1 + i * 0.05, (n[0] === "l" ? -0.2 : 0.2)]]));

test("side view maps forward (X) to screen x and up (Y) to screen up", () => {
  const p = project(J, CAMS.side);
  assert.ok(p.rank[0] > p.lsho[0]);                     // X 큼 → 화면 오른쪽
  assert.ok(p.rank[1] < p.lsho[1] === (J.rank[1] > J.lsho[1]));   // Y 큼 → 화면 y 작음(위)
});
test("front view maps lateral (Z) to screen x", () => {
  const p = project(J, CAMS.front);
  assert.ok(Math.abs(p.lsho[0] - p.rsho[0]) > 0.3);
  const p2 = project(J, CAMS.side); assert.ok(Math.abs(p2.lsho[0] - p2.rsho[0]) < 0.15);
});
test("top view maps lateral (Z) to screen y", () => {
  const p = project(J, CAMS.top);
  assert.ok(Math.abs(p.lsho[1] - p.rsho[1]) > 0.3);
});
test("rotating by 360 degrees returns the same projection", () => {
  const a = project(J, { yaw: 0.4, pitch: 0.2 }), b = project(J, { yaw: 0.4 + 2 * Math.PI, pitch: 0.2 });
  JOINTS.forEach(n => { assert.ok(Math.abs(a[n][0] - b[n][0]) < 1e-9 && Math.abs(a[n][1] - b[n][1]) < 1e-9); });
});
test("skeletonShapes fits inside the box for every view", () => {
  const b = boundsOf([J]);
  for (const cam of Object.values(CAMS)) {
    const s = skeletonShapes(J, cam, { w: 200, h: 200, pad: 10, bounds: b });
    for (const d of s.dots) assert.ok(d.x >= 0 && d.x <= 200 && d.y >= 0 && d.y <= 200, `${d.x},${d.y}`);
    assert.equal(s.lines.length, 12); assert.equal(s.dots.length, 12);
  }
});
test("skeletonSvg is a valid svg string with throwing arm class and no NaN", () => {
  const s = skeletonSvg(J, CAMS.side, { w: 120, h: 120, bounds: boundsOf([J]) });
  assert.match(s, /^<svg[^>]*viewBox="0 0 120 120"/); assert.ok(!/NaN|undefined/.test(s)); assert.match(s, /class="sk-throw"/);
});
