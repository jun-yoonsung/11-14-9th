/* 예측에 쓴 모델 이름을 화면·보고서 글로 바꾼다. 데이터(forecast.json 등)의 model 목록을 그대로 읽어 쓰므로, 다시 학습해 모델이 바뀌어도 글이 같이 바뀐다. */

/** ["ExtraTrees","XGBoost"] → "ExtraTrees·XGBoost 2개 모델의 평균", ["CatBoost(MAE)"] → "CatBoost(MAE 손실)" */
export function ensembleText(list) {
  if (!Array.isArray(list) || !list.length) return "";
  if (list.length > 1) return `${list.join("·")} ${list.length}개 모델의 평균`;
  return list[0].replace(/\(MAE\)/, "(MAE 손실)");
}

/** 머신러닝 방법 칸에 쓰는 글: 모델 이름이 있으면 같이 적는다 */
export function mlLabel(list) { const t = ensembleText(list); return t ? `머신러닝(${t})` : "머신러닝 모델"; }

/** 팀 승률 예측의 쓴 방법 */
export const TEAM_MODEL_NAME = {
  ExtraTrees: "ExtraTrees(머신러닝, 결정나무 여러 개의 평균)", Ridge: "Ridge 회귀(선형 모델)", CatBoost: "CatBoost(머신러닝, 부스팅 나무)",
  league: "리그 평균(.500)", last: "작년 승률", pyth: "득실 기반 기대 승률", avg3: "최근 3시즌 평균", shrunk: "최근 3시즌 가중 평균을 .500 쪽으로 당긴 값",
};

/** 영상 구속·배트속도 예측에 쓴 모델(ml/form_models.json, hit_models.json에서 검증 1등으로 고른 이름) */
const SPEED_MODELS = { ridge: "Ridge 회귀(선형 모델)", extratrees: "ExtraTrees(머신러닝)", xgboost: "XGBoost(머신러닝)", catboost: "CatBoost(머신러닝)", mlp: "신경망(MLP)" };
export const speedModelText = name => (name && SPEED_MODELS[name]) || "";
