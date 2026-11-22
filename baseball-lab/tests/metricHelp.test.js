import { test } from "node:test";
import assert from "node:assert/strict";
import { TYPES } from "../src/lib/stats.js";
import { HELP, tipOf } from "../src/lib/metricHelp.js";

test("every metric of every analysis type has a one-line meaning", () => {
  for (const type of ["batter", "pitcher", "team"]) {
    const missing = TYPES[type].defs.filter(d => !HELP[type][d.key]).map(d => d.key);
    assert.deepEqual(missing, [], `${type} 뜻이 없는 지표`);
  }
});
test("no stale help entries for metrics that do not exist", () => {
  for (const type of ["batter", "pitcher", "team"]) {
    const keys = new Set(TYPES[type].defs.map(d => d.key));
    assert.deepEqual(Object.keys(HELP[type]).filter(k => !keys.has(k)), [], `${type} 없는 지표의 설명`);
  }
});
test("tipOf: direction follows def.better, accumulated counts have no direction, meaning and formula pass through", () => {
  const era = TYPES.pitcher.defs.find(d => d.key === "ERA"), avg = TYPES.batter.defs.find(d => d.key === "AVG"), hr = TYPES.batter.defs.find(d => d.key === "HR");
  assert.equal(tipOf("pitcher", era).dir, "낮을수록 좋아요"); assert.equal(tipOf("batter", avg).dir, "높을수록 좋아요"); assert.equal(tipOf("batter", hr).dir, "높을수록 좋아요"); assert.equal(tipOf("batter", TYPES.batter.defs.find(d => d.key === "PA")).dir, "");   // 누적 기록은 방향 없음
  assert.ok(tipOf("batter", avg).meaning.length > 5 && tipOf("batter", avg).how.includes("타수"));
  assert.equal(tipOf("batter", { key: "ZZZ", better: "high", kind: "rate" }).meaning, "");
});
