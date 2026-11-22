import { test } from "node:test";
import assert from "node:assert/strict";
import { JOINTS } from "../src/lib/form.js";
import { pickPerson, follow, wristSpeed, suggestWindow, detectHand } from "../src/lib/segment.js";

const joints = (cx, cy, w = {}) => Object.fromEntries(JOINTS.map(n => [n, { x: cx + (n[0] === "l" ? -0.02 : 0.02), y: cy, v: 1, ...(w[n] || {}) }]));
const world = (wr = {}, wl = {}) => Object.fromEntries(JOINTS.map(n => [n, { x: 0, y: 1, z: 0, v: 1, ...(n === "rwri" ? wr : n === "lwri" ? wl : {}) }]));
const person = (cx, cy, wr, wl) => ({ j: world(wr, wl), img: joints(cx, cy) });
const fr = (t, ...ps) => ({ t, j: ps[0]?.j ?? null, img: ps[0]?.img ?? null, all: ps });

/** 던지는 손목(rwri)이 releaseT에 가장 빠른 영상: 1초에 1m 이동, 릴리스 직전 한 프레임만 3m */
function pitchFrames(fps, dur, releaseT, hand = "rwri") {
  const out = []; let x = 0;
  for (let i = 0; i <= dur * fps; i++) {
    const t = i / fps, near = Math.abs(t - releaseT) < 0.5 / fps;
    x += near ? 3 / fps * 8 : 1 / fps * 0.3;
    const pos = { x };
    out.push(fr(t, person(0.5, 0.5, hand === "rwri" ? pos : {}, hand === "lwri" ? pos : {})));
  }
  return out;
}

test("pickPerson picks the person nearest to the click", () => {
  const f = fr(0, person(0.2, 0.5), person(0.7, 0.5));
  assert.equal(pickPerson(f, 0.68, 0.5), 1); assert.equal(pickPerson(f, 0.1, 0.4), 0);
  assert.equal(pickPerson(fr(0), 0.5, 0.5), -1);
});

test("suggestWindow finds release peak and clips 1.5s before/1.0s after", () => {
  const f = pitchFrames(10, 12, 6.0), w = suggestWindow(f, "R", 10);
  assert.ok(w); assert.ok(Math.abs(w.release - 6.0) <= 0.15);
  assert.ok(Math.abs(w.start - (w.release - 1.5)) < 0.11 && Math.abs(w.end - (w.release + 1.0)) < 0.11);
  assert.ok(["높음", "보통"].includes(w.confidence));
});

test("suggestWindow returns null when no frame has wrist speed above noise", () => {
  const f = []; for (let i = 0; i < 120; i++) f.push(fr(i / 10, person(0.5, 0.5, { x: 0.01 * Math.sin(i) })));
  assert.equal(suggestWindow(f, "R", 10), null);
});

test("suggestWindow clamps to video bounds near start/end", () => {
  const a = suggestWindow(pitchFrames(10, 8, 0.8), "R", 10), b = suggestWindow(pitchFrames(10, 8, 7.6), "R", 10);
  assert.ok(a.start >= 0 && a.start === 0); assert.ok(b.end <= 8 + 1e-9);
});

test("window shorter than 0.8s yields null", () => {
  assert.equal(suggestWindow(pitchFrames(10, 0.7, 0.3), "R", 10), null);
});

test("detectHand picks the faster wrist", () => {
  assert.equal(detectHand(pitchFrames(10, 10, 5, "rwri")), "R");
  assert.equal(detectHand(pitchFrames(10, 10, 5, "lwri")), "L");
});

test("wristSpeed is zero for lost frames and same length", () => {
  const f = pitchFrames(10, 3, 1.5); f[5] = { t: f[5].t, j: null, img: null, all: [] };
  const s = wristSpeed(f, "R"); assert.equal(s.length, f.length); assert.equal(s[5], 0);
});

test("follow keeps the chosen person when two people cross", () => {
  // 사람 0은 왼→오(0.2→0.8), 사람 1은 오→왼. 지나칠 때 순서(배열 위치)가 바뀐다. 손목 x에 사람 표시(0은 +0, 1은 +100).
  const frames = [];
  for (let i = 0; i <= 12; i++) {
    const a = person(0.2 + 0.05 * i, 0.5, { x: 0 + i * 0.001 }), b = person(0.8 - 0.05 * i, 0.5, { x: 100 + i * 0.001 });
    frames.push(fr(i / 10, ...(a.img.lsho.x < b.img.lsho.x ? [a, b] : [b, a])));
  }
  const out = follow(frames, frames[0].all.findIndex(p => p.j.rwri.x < 50));
  assert.ok(out.every(f => f.j && f.j.rwri.x < 50));
});

test("follow marks lost frames as null and does not throw", () => {
  const frames = [fr(0, person(0.5, 0.5)), fr(0.1), fr(0.2, person(0.52, 0.5)), fr(0.3, person(0.95, 0.9))];
  const out = follow(frames, 0);
  assert.equal(out.length, 4);
  assert.equal(out[1].j, null); assert.ok(out[2].j); assert.equal(out[3].j, null);
});

import { detectSide, suggestSwingWindow } from "../src/lib/segment.js";
const mkJ = (lankY, rankY, hx) => Object.fromEntries(["lsho", "rsho", "lelb", "relb", "lwri", "rwri", "lhip", "rhip", "lkne", "rkne", "lank", "rank"].map(n => [n, { x: n.endsWith("wri") ? hx : 0, y: n === "lank" ? lankY : n === "rank" ? rankY : 1, z: 0, v: 1 }]));
test("detectSide: the foot that lifts more is the lead foot (left foot lifts -> right-handed hitter)", () => {
  const fr = Array.from({ length: 10 }, (_, i) => ({ t: i / 5, j: mkJ(i === 4 ? 0.4 : 0, 0.02, 0) }));
  assert.equal(detectSide(fr), "R");
  assert.equal(detectSide(fr.map(f => ({ t: f.t, j: mkJ(0.02, f.j.lank.y, 0) }))), "L");
});
test("suggestSwingWindow: peaks of hand speed give a window of 1.2 s before to 0.6 s after, or null when still", () => {
  const fr = Array.from({ length: 20 }, (_, i) => ({ t: i * 0.2, j: mkJ(0, 0, i < 10 ? 0 : (i - 9) * 0.8) }));
  const w = suggestSwingWindow(fr, 5);
  assert.ok(w && w.release >= 1.8 && w.end - w.start >= 0.8, JSON.stringify(w));
  assert.equal(suggestSwingWindow(fr.map(f => ({ t: f.t, j: mkJ(0, 0, 0) })), 5), null);
});

import { soleSeed } from "../src/lib/segment.js";
test("soleSeed: exactly one person gives that person's screen center, otherwise null (regression: real video crashed with {j,img} passed to center)", () => {
  const img = Object.fromEntries(JOINTS.map((n, i) => [n, { x: 0.4, y: 0.2 + i * 0.01, v: 1 }]));
  const one = soleSeed([{ j: {}, img }]);
  assert.ok(Math.abs(one[0] - 0.4) < 1e-9 && one[1] > 0.2 && one[1] < 0.35);
  assert.equal(soleSeed([]), null); assert.equal(soleSeed([{ img }, { img }]), null); assert.equal(soleSeed(undefined), null);
});

import { cropRect } from "../src/lib/segment.js";
test("cropRect: small person gets a padded, clamped crop box around where they move; large or missing person gets null", () => {
  const person = (cx, cy, h) => Object.fromEntries(JOINTS.map((n, i) => [n, { x: cx + ((i % 3) - 1) * 0.02, y: cy - h / 2 + (i / (JOINTS.length - 1)) * h, v: 1 }]));
  const small = [0, 1, 2].map(k => ({ t: k * 0.2, img: person(0.3 + k * 0.02, 0.5, 0.25) }));
  const r = cropRect(small, { aspect: 1 });
  assert.ok(r.x < 0.28 && r.x + r.w > 0.36 && r.y < 0.375 && r.y + r.h > 0.625, "사람 움직임 전체를 감싼다");
  assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 && r.y + r.h <= 1, "화면 안");
  assert.ok(r.h < 0.9, "화면 전체가 아니다");
  assert.equal(cropRect([{ t: 0, img: person(0.5, 0.5, 0.8) }], { aspect: 1 }), null);       // 이미 큼
  assert.equal(cropRect([], { aspect: 1 }), null); assert.equal(cropRect([{ t: 0, img: null }], { aspect: 1 }), null);
  const edge = cropRect([{ t: 0, img: person(0.02, 0.95, 0.1) }], { aspect: 1 });            // 가장자리: 화면 밖으로 나가지 않음
  assert.ok(edge.x >= 0 && edge.y >= 0 && edge.x + edge.w <= 1 + 1e-9 && edge.y + edge.h <= 1 + 1e-9);
});

import { uncrop } from "../src/lib/segment.js";
test("uncrop maps crop-relative screen coordinates back to the full frame", () => {
  const img = Object.fromEntries(JOINTS.map(n => [n, { x: 0.5, y: 0.25, z: 0.1, v: 1 }]));
  const r = uncrop(img, { x: 0.2, y: 0.4, w: 0.2, h: 0.4 });
  assert.ok(Math.abs(r.lsho.x - 0.3) < 1e-9 && Math.abs(r.lsho.y - 0.5) < 1e-9 && r.lsho.v === 1);
  assert.equal(uncrop(null, { x: 0, y: 0, w: 1, h: 1 }), null);
});

import { adjustClip } from "../src/lib/segment.js";
test("adjustClip keeps the clip between min and max length and inside the range when a handle moves", () => {
  const R = { start: 0, end: 10 }, lim = { min: 0.8, max: 6 };
  // 시작을 끝 너머로 끌면 끝을 밀지 않고 시작이 끝-최소에서 멈춘다
  assert.deepEqual(adjustClip({ start: 3, end: 4.8 }, "start", 9, R, lim), { start: 4, end: 4.8 });
  // 끝을 시작보다 앞으로 끌면 시작+최소에서 멈춘다
  assert.deepEqual(adjustClip({ start: 3, end: 4.8 }, "end", 1, R, lim), { start: 3, end: 3.8 });
  // 6초를 넘기게 끝을 늘리면 끝이 시작+6에서 멈춘다
  assert.deepEqual(adjustClip({ start: 1, end: 4 }, "end", 9, R, lim), { start: 1, end: 7 });
  // 6초를 넘기게 시작을 앞으로 당기면 시작이 끝-6에서 멈춘다
  assert.deepEqual(adjustClip({ start: 4, end: 9 }, "start", 0, R, lim), { start: 3, end: 9 });
  // 정상 이동은 그대로, 범위 밖은 범위 안으로
  assert.deepEqual(adjustClip({ start: 3, end: 5 }, "start", 2.5, R, lim), { start: 2.5, end: 5 });
  assert.deepEqual(adjustClip({ start: 3, end: 5 }, "end", 99, R, lim), { start: 3, end: 9 });
});

import { sampleTimes } from "../src/lib/segment.js";
test("sampleTimes spreads person-search times over the range, starting at its beginning", () => {
  assert.deepEqual(sampleTimes(0, 6, 4), [0, 2, 4, 6]);
  assert.deepEqual(sampleTimes(2, 2.8, 5), [2, 2.2, 2.4, 2.6, 2.8]);
  assert.deepEqual(sampleTimes(3, 3, 5), [3]);
});
