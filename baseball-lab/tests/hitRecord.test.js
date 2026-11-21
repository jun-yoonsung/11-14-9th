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
  const low = { conf: "낮음", sport: "pitching", bone: { ok: false, cv: 0.199 }, events: { fp: null, br: 5 } };
  const out = lowReasons(low);
  assert.equal(out.length, 2); assert.match(out[0], /길이/); assert.match(out[0], /0\.20/); assert.match(out[1], /착지/);
  assert.match(lowReasons({ conf: "낮음", sport: "pitching", bone: { ok: true }, events: { fp: 3, br: null } })[0], /릴리스/);
  assert.equal(lowReasons({ conf: "높음", bone: { ok: true }, events: { fp: 1, br: 2 } }).length, 0);
});

import { finalConf } from "../src/lib/formRecord.js";
test("finalConf: a missing foot plant lowers confidence for pitching but not for hitting (its landmark-dependent features are simply left blank)", () => {
  const ok = { fp: null, br: 5 };
  assert.equal(finalConf("높음", { sport: "pitching", events: ok, wristMax: 9 }), "낮음");
  assert.equal(finalConf("높음", { sport: "hitting", events: ok, wristMax: 9 }), "보통");   // 착지 기준 지표가 비므로 최대 보통
  assert.equal(finalConf("보통", { sport: "hitting", events: ok, wristMax: 9 }), "보통");
  assert.equal(finalConf("높음", { sport: "hitting", events: { fp: 3, br: null }, wristMax: 9 }), "낮음");   // 타격 순간을 못 찾으면 낮음
  assert.equal(finalConf("높음", { sport: "hitting", events: { fp: 3, br: 5 }, wristMax: 1 }), "낮음");      // 움직임이 너무 작으면 낮음
});
test("lowReasons does not blame a missing foot plant for hitting", () => {
  const r = lowReasons({ conf: "낮음", sport: "hitting", bone: { ok: false, cv: 0.2 }, events: { fp: null, br: 5 } });
  assert.equal(r.length, 1); assert.doesNotMatch(r[0], /착지/);
});

test("finalConf caps confidence at 보통 when bone-length variation exceeds 0.10 (simulation: reliable features fall from 8 to 7 of 12 near 0.12 and collapse to 2 near 0.17)", () => {
  const e = { fp: 3, br: 5 }, base = { sport: "pitching", events: e, wristMax: 9 };
  assert.equal(finalConf("높음", { ...base, boneCv: 0.066 }), "높음");
  assert.equal(finalConf("높음", { ...base, boneCv: 0.12 }), "보통");
  assert.equal(finalConf("보통", { ...base, boneCv: 0.12 }), "보통");
  assert.equal(finalConf("높음", { ...base }), "높음");          // 값이 없으면 제한하지 않음
});

import { findEvents } from "../src/lib/form.js";
test("findEvents: a foot plant that would come after the release is not accepted (real low-angle clip gave plant 0.8 s after release)", () => {
  const frames = Array.from({ length: 31 }, (_, i) => {
    const ly = i < 20 ? 0.5 : 0.0, wx = i < 10 ? 0 : 1.5;                 // 앞발은 20프레임에 내려오고, 손목 속도 정점은 10프레임 부근
    const P = (x, y) => ({ x, y, z: 0, v: 1 });
    return { t: i / 30, j: { lsho: P(0, 1), rsho: P(0, 1), lhip: P(0, 0.5), rhip: P(0, 0.5), lelb: P(0, 0.8), relb: P(0, 0.8), lwri: P(0, 0.6), rwri: P(wx, 0.6), lkne: P(0, 0.3), rkne: P(0, 0.3), lank: P(0, ly), rank: P(0, 0) } };
  });
  const ev = findEvents(frames);
  assert.ok(ev.br != null && ev.br < 20);
  assert.equal(ev.fp, null);
});

import { fixLeftRight } from "../src/lib/form.js";
test("fixLeftRight: undoes a left/right label swap that starts mid-clip and leaves a clean clip untouched", () => {
  const c = FX.find(x => x.name === "real_side_R"), clean = rawFrames(c).filter((_, i) => i % 12 === 0);   // 30fps 정도
  const pairs = [["lsho", "rsho"], ["lelb", "relb"], ["lwri", "rwri"], ["lhip", "rhip"], ["lkne", "rkne"], ["lank", "rank"]];
  const same = (a, b) => JOINTS.every(n => Math.hypot(a.j[n].x - b.j[n].x, a.j[n].y - b.j[n].y, a.j[n].z - b.j[n].z) < 1e-9);
  assert.ok(fixLeftRight(clean).every((f, i) => same(f, clean[i])), "깨끗한 영상은 그대로");
  const k = Math.floor(clean.length * 0.6);
  const bad = clean.map((f, i) => { if (i < k) return f; const j = { ...f.j }; for (const [a, b] of pairs) { j[a] = f.j[b]; j[b] = f.j[a]; } return { ...f, j }; });
  const fixed = fixLeftRight(bad), wrong = fixed.filter((f, i) => !same(f, clean[i])).length;
  assert.ok(wrong <= 1, `복원 못 한 프레임 ${wrong}`);
});
