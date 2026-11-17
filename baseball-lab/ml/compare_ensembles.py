#!/usr/bin/env python3
"""앙상블(여러 모델 평균) 후보 비교. 검증 구간으로 고르고 시험 구간은 확인용."""
import sys, warnings, json
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent)); warnings.filterwarnings("ignore")
import train_forecast as T
from models import Ens
from sklearn.metrics import mean_absolute_error as mae

ENS = {
    "batter": {"ET+RF+XGB+LGBM": ["ExtraTrees", "랜덤포레스트", "XGBoost", "LightGBM"], "ET+XGB": ["ExtraTrees", "XGBoost"], "ET+RF": ["ExtraTrees", "랜덤포레스트"],
               "ET+RF+XGB+LGBM+HGB": ["ExtraTrees", "랜덤포레스트", "XGBoost", "LightGBM", "HGB(MAE 손실)"], "ET 단독": ["ExtraTrees"],
               "ET+XGB+CatBoost": ["ExtraTrees", "XGBoost", "CatBoost"], "ET+XGB+CatBoost+MLP": ["ExtraTrees", "XGBoost", "CatBoost", "신경망(MLP)"], "ET+CatBoost": ["ExtraTrees", "CatBoost"], "CatBoost 단독": ["CatBoost"], "ET큰+XGB+CatBoost(깊게)": ["ExtraTrees(큰)", "XGBoost", "CatBoost(깊게)"]},
    "pitcher": {"LGBM(MAE) 단독": ["LightGBM(MAE)"], "LGBM(MAE)+XGB(MAE)": ["LightGBM(MAE)", "XGBoost(MAE)"], "LGBM(MAE)+XGB(MAE)+HGB(MAE)": ["LightGBM(MAE)", "XGBoost(MAE)", "HGB(MAE 손실)"],
                "MAE계열3+ET+RF": ["LightGBM(MAE)", "XGBoost(MAE)", "HGB(MAE 손실)", "ExtraTrees", "랜덤포레스트"], "LGBM(MAE)+ET": ["LightGBM(MAE)", "ExtraTrees"],
                "LGBM(MAE)+CatBoost(MAE)": ["LightGBM(MAE)", "CatBoost(MAE)"], "LGBM(MAE)+CatBoost(MAE)+XGB(MAE)": ["LightGBM(MAE)", "CatBoost(MAE)", "XGBoost(MAE)"], "CatBoost(MAE) 단독": ["CatBoost(MAE)"], "LGBM(MAE)+CatBoost(MAE)+MLP": ["LightGBM(MAE)", "CatBoost(MAE)", "신경망(MLP)"]},
}

def main():
    b, p = T.load(); out = {}
    for kind, df in (("batter", b), ("pitcher", p)):
        cfg = T.CFG[kind]; X, _, _ = T.build_rows(df, cfg, T.HORIZONS); cols = T.feature_cols(X, cfg); res = {}
        for name, ns in ENS[kind].items():
            v, t = [], []
            for h in T.HORIZONS:
                tgt = f"y{h}"; d = X[X[tgt].notna()]; tr, va, te, trv = T.split(d, h, cfg)
                v.append(mae(va[tgt], Ens(ns).fit(tr[cols], tr[tgt]).predict(va[cols]))); t.append(mae(te[tgt], Ens(ns).fit(trv[cols], trv[tgt]).predict(te[cols])))
            res[name] = {"models": ns, "val": float(np.mean(v)), "test": float(np.mean(t))}
        print(f"\n== {kind} 앙상블 후보 (1~5년 평균 오차)  검증 | 시험")
        for n, r in sorted(res.items(), key=lambda kv: kv[1]["val"]): print(f"  {n:30s} {r['val']:.4f} | {r['test']:.4f}")
        out[kind] = res
    Path(T.ROOT / "ml/ensemble_comparison.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

if __name__ == "__main__": main()
