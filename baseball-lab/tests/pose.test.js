import { test } from "node:test";
import assert from "node:assert/strict";
import { frameTimes, needsTrim, MAX_UNTRIMMED_SEC, toScreen } from "../src/lib/pose.js";

test("frameTimes steps 1/fps from start to end inclusive", () => {
  const t = frameTimes(1, 2, 4);
  assert.deepEqual(t.map(x => +x.toFixed(6)), [1, 1.25, 1.5, 1.75, 2]);
});
test("frameTimes always includes the end time even when not on the grid", () => {
  const t = frameTimes(0, 1, 3);
  assert.equal(t[0], 0); assert.equal(t[t.length - 1], 1);
});
test("frameTimes of empty or reversed range", () => {
  assert.deepEqual(frameTimes(2, 2, 5), [2]);
  assert.deepEqual(frameTimes(3, 2, 5), []);
});
test("needsTrim is true above 600 s only", () => {
  assert.equal(MAX_UNTRIMMED_SEC, 600);
  assert.equal(needsTrim(600), false); assert.equal(needsTrim(600.5), true); assert.equal(needsTrim(30), false);
  assert.equal(needsTrim(NaN), true);
});
test("toScreen keeps 12 joints as normalized x,y plus visibility", () => {
  const lm = Array.from({ length: 33 }, (_, i) => ({ x: i / 100, y: 1 - i / 100, z: 0, visibility: 0.9 }));
  const s = toScreen(lm);
  assert.equal(Object.keys(s).length, 12);
  assert.deepEqual(s.lsho, { x: 0.11, y: 0.89, v: 0.9 });
});
