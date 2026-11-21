import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { predictSpeed, predictRaw } from "../src/lib/formModel.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/form_model_parity.json", import.meta.url), "utf8"));

test("predictRaw reproduces Python predictions for every model kind within 0.05 mph", () => {
  assert.equal(FX.length, 5);
  for (const c of FX) {
    const got = predictRaw(c.model, c.X);
    c.y.forEach((y, i) => assert.ok(Math.abs(got[i] - y) <= 0.05, `${c.model.name} row ${i}: ${got[i]} vs ${y}`));
  }
});

test("predictSpeed maps feature object by name and returns mph with rmse", () => {
  const c = FX[0], m = { side: { ...c.model, features: ["a", "b", "c", "d"], rmse: 4.6 } };
  const r = predictSpeed(m, "side", { a: c.X[0][0], b: c.X[0][1] ?? null, c: c.X[0][2], d: c.X[0][3] });
  assert.ok(Math.abs(r.mph - c.y[0]) < 0.05); assert.equal(r.rmse, 4.6);
});

test("predictSpeed returns null for a view without a model", () => {
  assert.equal(predictSpeed({ side: FX[0].model }, "back", {}), null);
  assert.equal(predictSpeed(null, "side", {}), null);
});

test("predictSpeed tolerates missing features (null) via median imputation", () => {
  const c = FX[1], r = predictSpeed({ v: { ...c.model, rmse: 5 } }, "v", { a: null, b: null, c: null, d: null });
  assert.ok(Number.isFinite(r.mph));
});
