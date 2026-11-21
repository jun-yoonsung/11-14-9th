import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JOINTS } from "../src/lib/form.js";
import { buildResult, buildRecord, MAX_RECORD_CHARS } from "../src/lib/formRecord.js";
import { buildHitCards, speedUseful } from "../src/lib/hitCards.js";
import { BANNED, MSG_LACK, MSG_IN } from "../src/lib/cards.js";
import { HIT_KEYS } from "../src/lib/hit.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/hit_parity.json", import.meta.url), "utf8"));
const REF = JSON.parse(readFileSync(new URL("../public/data/hit_ref.json", import.meta.url), "utf8"));
const rawFrames = c => c.t.map((t, i) => ({ t, j: Object.fromEntries(JOINTS.map(n => [n, { x: c.raw[n][i][0], y: c.raw[n][i][1], z: c.raw[n][i][2], v: 1 }])) }));

test("hitting result: sport, event labels, 12 hitting features and a bounded record", () => {
  const c = FX.find(x => x.name === "real_side_R");
  const res = buildResult(rawFrames(c), { view: "side", hand: c.hand, ref: REF, model: null, sport: "hitting" });
  assert.equal(res.sport, "hitting"); assert.equal(res.kind, "form");
  assert.deepEqual(Object.keys(res.features), HIT_KEYS);
  assert.deepEqual(res.keyframes.map(k => k.label).filter(l => l === "타격 순간" || l === "앞발 착지" || l === "앞발 들기").length, 3);
  const rec = buildRecord({ id: "t", params: { view: "side", hand: c.hand }, result: res, sport: "hitting" });
  assert.equal(rec.type, "hitting"); assert.match(rec.title, /타격 자세/);
  assert.ok(JSON.stringify(rec).length <= MAX_RECORD_CHARS);
});

test("hit cards: no card text contains banned words; unreliable or low-confidence input yields the lack message", () => {
  const f = Object.fromEntries(HIT_KEYS.map(k => [k, (REF.ref[k].p10 + REF.ref[k].p25) / 2]));   // 모두 참조 범위보다 낮음
  const out = buildHitCards({ features: f, view: "side", ref: REF, conf: "높음" });
  assert.ok(out.cards.length >= 1);
  for (const c of out.cards) assert.ok(!BANNED.test(JSON.stringify(c)), c.title);
  assert.equal(buildHitCards({ features: f, view: "side", ref: REF, conf: "낮음" }).message, MSG_LACK);
  const inside = Object.fromEntries(HIT_KEYS.map(k => [k, (REF.ref[k].target[0] + REF.ref[k].target[1]) / 2]));
  assert.equal(buildHitCards({ features: inside, view: "side", ref: REF, conf: "높음" }).message, MSG_IN);
});

test("hit speed range is hidden unless the model beats the spread of bat speeds", () => {
  assert.equal(speedUseful(REF, "side"), REF.meta.models.side[REF.meta.best.side].rmse < 0.95 * REF.meta.speed_sd);
  const fake = { meta: { best: { side: "ridge" }, models: { side: { ridge: { rmse: 3.0 } } }, speed_sd: 4.9 } };
  assert.equal(speedUseful(fake, "side"), true);
});

test("cards skip values barely outside the reference range (deviation < 0.3 of its width)", () => {
  const k = "stride_torso", r = REF.ref[k], width = r.p75 - r.p25, lo = r.target[0];
  const f = Object.fromEntries(HIT_KEYS.map(x => [x, (REF.ref[x].target[0] + REF.ref[x].target[1]) / 2]));
  assert.equal(buildHitCards({ features: { ...f, [k]: lo - 0.1 * width }, view: "side", ref: REF, conf: "높음" }).message, MSG_IN);
  assert.ok(buildHitCards({ features: { ...f, [k]: lo - 1.0 * width }, view: "side", ref: REF, conf: "높음" }).cards.some(c => c.key === k));
});

import { lowReasons } from "../src/lib/formLabels.js";
test("lowReasons explains a low-confidence result (unstable bones, missing foot plant) and is empty otherwise", () => {
  const low = { conf: "낮음", sport: "hitting", bone: { ok: false }, events: { fp: null, br: 5 } };
  const out = lowReasons(low);
  assert.equal(out.length, 2); assert.match(out[0], /길이/); assert.match(out[1], /착지/);
  assert.match(lowReasons({ conf: "낮음", sport: "pitching", bone: { ok: true }, events: { fp: 3, br: null } })[0], /릴리스/);
  assert.equal(lowReasons({ conf: "높음", bone: { ok: true }, events: { fp: 1, br: 2 } }).length, 0);
});
