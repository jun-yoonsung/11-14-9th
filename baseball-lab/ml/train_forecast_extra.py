#!/usr/bin/env python3
"""OPS·ERA 외 다른 지표의 앞으로 1~5년 예측. train_forecast.py와 같은 방법(시간 순서 검증, 시점별 ML/3년 가중평균/리그 평균 중 검증 1등,
80% 범위 보정)을 지표마다 되풀이해 public/data/forecast_extra.json 으로 저장한다."""
import json, sys, warnings
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent)); warnings.filterwarnings("ignore")
import train_forecast as T

# 지표 이름, 값을 보여 줄 때의 자릿수
EXTRA = {"batter": [("OBP", "출루율", 3), ("SLG", "장타율", 3), ("K", "삼진 비율", 3), ("BBr", "볼넷 비율", 3), ("HRr", "홈런 비율", 3)],
         "pitcher": [("WHIP", "WHIP", 2), ("K9", "9이닝당 삼진", 1), ("BB9", "9이닝당 볼넷", 1), ("HR9", "9이닝당 피홈런", 2)]}

# 지표마다 모델 구성을 검증 구간(2021~2023) 오차로 따로 고른다(시험 구간은 고르는 데 쓰지 않음)
SETS = {"batter": [["ExtraTrees", "XGBoost", "CatBoost", "신경망(MLP)"], ["ExtraTrees"], ["CatBoost"], ["ExtraTrees", "XGBoost"]],
        "pitcher": [["CatBoost(MAE)"], ["LightGBM(MAE)"], ["ExtraTrees"], ["ExtraTrees", "CatBoost(MAE)"]]}

def best_run(kind, cfg, df):
    best = None
    for ms in SETS[kind]:
        r = T.run(kind, cfg, df, with_act=False, mid_models=ms); v = float(np.mean([r[2]["reg"][h]["mae_cal_ml"] for h in T.HORIZONS]))
        if best is None or v < best[0]: best = (v, ms, r)
    return best

def main():
    b, p = T.load(); out = {"meta": {"base_season": T.LAST, "horizons": T.HORIZONS, "stats": {}, "metrics": {}}, "players": {}}
    for kind, df in (("batter", b), ("pitcher", p)):
        for key, label, dg in EXTRA[kind]:
            cfg = dict(T.CFG[kind], target=key)
            val, ms, (X, cols, metrics, models) = best_run(kind, cfg, df)
            out["meta"]["stats"].setdefault(kind, []).append({"key": key, "label": label, "digits": dg, "model": ms, "val_mae": round(val, 4)})
            out["meta"]["metrics"][f"{kind}:{key}"] = {h: {k: metrics["reg"][h][k] for k in ("chosen", "n_test", "mae_chosen", "mae_last", "coverage80")} for h in T.HORIZONS}
            cur = X[X.t == T.LAST]; pred = {}
            for h in T.HORIZONS:
                M = models[h]
                if M["chosen"] == "ml":
                    mid0 = M["mid"].predict(cur[cols]); lo_, hi_ = T.widen(mid0, M["lo"].predict(cur[cols]), M["hi"].predict(cur[cols]), M["scale"]); mid_ = np.clip(mid0, lo_, hi_)
                else:
                    v = T.baselines(cur, cfg, h)[M["chosen"]]; mid_ = np.nan_to_num(v, nan=np.nanmean(v)); lo_, hi_ = mid_ + M["resq"][0], mid_ + M["resq"][1]
                pred[h] = (mid_, lo_, hi_)
            for i, (_, r) in enumerate(cur.iterrows()):
                e = out["players"].setdefault(str(int(r.Id)), {})
                e[key] = {"now": round(float(r[f"{key}_0"]), dg), "pred": [{"h": h, "mid": round(float(pred[h][0][i]), dg), "lo": round(float(pred[h][1][i]), dg), "hi": round(float(pred[h][2][i]), dg), "method": models[h]["chosen"]} for h in T.HORIZONS]}
            m = metrics["reg"]; print(f"{kind}:{key:5s} 모델 {"+".join(ms)} 1년 뒤 오차 {m[1]['mae_chosen']:.4f} (작년값 {m[1]['mae_last']:.4f}) 5년 뒤 {m[5]['mae_chosen']:.4f} ({m[5]['mae_last']:.4f}) 80%적중 {m[1]['coverage80']:.0%}/{m[5]['coverage80']:.0%} 선택 {[m[h]['chosen'] for h in T.HORIZONS]}")
    path = T.ROOT / "public/data/forecast_extra.json"; path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"); print("->", path, path.stat().st_size // 1024, "KB")

if __name__ == "__main__": main()
