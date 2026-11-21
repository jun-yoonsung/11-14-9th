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

import { nativeFps, fineFps } from "../src/lib/pose.js";
test("nativeFps: median frame spacing snapped to a common frame rate; nothing usable gives null", () => {
  assert.equal(nativeFps([1 / 30, 1 / 30, 0.0334, 1 / 30]), 30);
  assert.equal(nativeFps([1 / 60, 1 / 60, 1 / 59.9, 1 / 60, 0.05]), 60);          // 튀는 간격 하나는 중앙값이 무시
  assert.equal(nativeFps([1 / 29.97, 1 / 29.97, 1 / 29.97]), 30);
  assert.equal(nativeFps([1 / 240, 1 / 240, 1 / 240]), 240);
  assert.equal(nativeFps([]), null); assert.equal(nativeFps([0, 0]), null);
});
test("fineFps: analyze at 60 fps when the video has it, otherwise 30 (unknown stays at 30)", () => {
  assert.equal(fineFps(240), 60); assert.equal(fineFps(120), 60); assert.equal(fineFps(60), 60); assert.equal(fineFps(50), 60);
  assert.equal(fineFps(30), 30); assert.equal(fineFps(25), 30); assert.equal(fineFps(24), 30); assert.equal(fineFps(null), 30);
});
