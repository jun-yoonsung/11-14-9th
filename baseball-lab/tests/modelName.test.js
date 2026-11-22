import { test } from "node:test";
import assert from "node:assert/strict";
import { ensembleText, mlLabel, TEAM_MODEL_NAME } from "../src/lib/modelName.js";

test("ensembleText names every model; several are described as an average", () => {
  assert.equal(ensembleText(["ExtraTrees", "XGBoost", "CatBoost", "신경망(MLP)"]), "ExtraTrees·XGBoost·CatBoost·신경망(MLP) 4개 모델의 평균");
  assert.equal(ensembleText(["CatBoost(MAE)"]), "CatBoost(MAE 손실)");
  assert.equal(ensembleText(["CatBoost"]), "CatBoost");
  assert.equal(ensembleText(undefined), "");
});
test("mlLabel keeps the plain word and adds the names", () => {
  assert.equal(mlLabel(["ExtraTrees", "XGBoost"]), "머신러닝(ExtraTrees·XGBoost 2개 모델의 평균)");
  assert.equal(mlLabel(undefined), "머신러닝 모델");
});
test("team model names say which model, not just 'machine learning'", () => {
  assert.match(TEAM_MODEL_NAME.ExtraTrees, /ExtraTrees/); assert.match(TEAM_MODEL_NAME.Ridge, /Ridge/); assert.match(TEAM_MODEL_NAME.CatBoost, /CatBoost/);
  assert.equal(TEAM_MODEL_NAME.league, "리그 평균(.500)");
});

import { speedModelText } from "../src/lib/modelName.js";
test("video speed model name is spelled out; unknown or missing gives nothing", () => {
  assert.match(speedModelText("ridge"), /Ridge/); assert.equal(speedModelText(null), ""); assert.equal(speedModelText("zzz"), "");
});
