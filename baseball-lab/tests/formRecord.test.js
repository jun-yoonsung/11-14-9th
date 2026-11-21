import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JOINTS } from "../src/lib/form.js";
import { buildResult, buildRecord, fitBudget, MAX_RECORD_CHARS } from "../src/lib/formRecord.js";
import { BANNED } from "../src/lib/cards.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/form_parity.json", import.meta.url), "utf8"));
const REF = JSON.parse(readFileSync(new URL("../public/data/form_ref.json", import.meta.url), "utf8"));
const MODEL = JSON.parse(readFileSync(new URL("../public/data/form_model.json", import.meta.url), "utf8"));
const frames = c => c.t.map((t, i) => ({ t, j: Object.fromEntries(JOINTS.map(n => [n, { x: c.raw[n][i][0], y: c.raw[n][i][1], z: c.raw[n][i][2], v: 1 }])) }));
const real = FX.find(c => c.name === "real_clean_R");
const mk = (fr, extra = {}) => buildResult(fr, { view: "side", hand: "R", heightCm: 183, ref: REF, model: MODEL, ...extra });

test("buildResult makes events in order, 12 features, 36-number frames and a speed range", () => {
  const r = mk(frames(real));
  assert.equal(r.kind, "form");
  assert.ok(r.events.lift < r.events.fp && r.events.fp < r.events.br);
  assert.equal(Object.keys(r.features).length, 12);
  assert.ok(r.frames3d.every(f => f.length === 36));
  assert.ok(r.speed && r.speed.mph > 55 && r.speed.mph < 100 && r.speed.rmse > 3);
  assert.equal(r.keyframes.length, 4); assert.ok(r.use.length === 6 && r.sequence.steps.length === 4);
  assert.equal(r.refMeta.license, "CC BY-NC-SA 4.0");
});
test("record fits budget and never carries banned words in card text", () => {
  const rec = buildRecord({ id: "x", params: { view: "side", hand: "R", heightCm: 183, clip: { start: 0, end: 2.5 } }, result: mk(frames(real)) });
  assert.ok(JSON.stringify(rec).length <= MAX_RECORD_CHARS);
  assert.equal(rec.mode, "video"); assert.equal(rec.type, "pitching"); assert.match(rec.title, /^투구 폼 분석 \d{4}-\d{2}-\d{2}$/);
  for (const c of rec.result.cards) assert.ok(!BANNED.test(JSON.stringify(c)));
});
test("fitBudget shrinks an oversized record under the limit and keeps keyframes", () => {
  const big = mk(frames(real)), many = Array.from({ length: 12 }, () => big.frames3d).flat();
  const rec = { id: "x", result: { ...big, frames3d: many, series: { ...big.series, t: Array(many.length).fill(0), elbow: Array(many.length).fill(1.5) } } };
  const out = fitBudget(rec, 100_000);
  assert.ok(JSON.stringify(out).length <= 100_000 && out.result.frames3d.length >= 20 && out.result.keyframes.length === 4);
});
test("stretched limbs lower confidence and suppress cards", () => {
  const fr = frames(real).map((f, i) => (i % 2 ? { t: f.t, j: { ...f.j, relb: { ...f.j.relb, x: f.j.relb.x + 1.5 } } } : f));
  const r = mk(fr);
  assert.equal(r.conf, "낮음"); assert.equal(r.cards.length, 0); assert.equal(r.bone.ok, false);
});
test("a clip with no movement still returns a result without throwing", () => {
  const fr = frames(real).map(f => ({ t: f.t, j: frames(real)[0].j }));
  const r = mk(fr);
  assert.equal(r.kind, "form"); assert.equal(r.cards.length, 0);
});
test("left-handed fixture works through the same path", () => {
  const l = FX.find(c => c.hand === "L"), r = mk(frames(l), { hand: "L", view: "back" });
  assert.ok(r.events.br != null && r.frames3d.length === l.t.length);
});
test("missing model gives no speed, missing height gives no kbo card", () => {
  const r = mk(frames(real), { model: null, heightCm: null });
  assert.equal(r.speed, null); assert.ok(!r.cards.some(c => c.source === "kbo"));
});
