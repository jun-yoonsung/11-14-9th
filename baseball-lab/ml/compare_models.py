#!/usr/bin/env python3
"""예측 모델 후보 비교. 검증 구간(예측 대상 2021~2023)으로 모델을 고르고, 시험 구간(2024~2026)은 최종 확인에만 쓴다."""
import sys, warnings, json
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
import train_forecast as T
from models import cands
from sklearn.ensemble import HistGradientBoostingRegressor as HGB, RandomForestRegressor, ExtraTreesRegressor, GradientBoostingRegressor
from sklearn.linear_model import RidgeCV
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error
warnings.filterwarnings("ignore")

def main():
    b, p = T.load(); res = {}
    for kind, df in (("batter", b), ("pitcher", p)):
        cfg = T.CFG[kind]; X, base, lg = T.build_rows(df, cfg, T.HORIZONS); cols = T.feature_cols(X, cfg)
        table = {}
        for h in T.HORIZONS:
            tgt = f"y{h}"; d = X[X[tgt].notna()]
            tr = d[d.t + h < T.VAL_FROM]; va = d[(d.t + h >= T.VAL_FROM) & (d.t + h < T.TEST_FROM)]; te = d[d.t + h >= T.TEST_FROM]
            trv = d[d.t + h < T.TEST_FROM]            # 시험 전까지 전부로 다시 학습한 모델로 시험 구간을 잰다
            bl_v, bl_t = T.baselines(va, cfg, h), T.baselines(te, cfg, h)
            fill = lambda v: np.nan_to_num(v, nan=np.nanmean(v))
            row = {"3년가중(기준)": (mean_absolute_error(va[tgt], fill(bl_v["marcel"])), mean_absolute_error(te[tgt], fill(bl_t["marcel"]))),
                   "리그평균(기준)": (mean_absolute_error(va[tgt], fill(bl_v["league"])), mean_absolute_error(te[tgt], fill(bl_t["league"])))}
            for name, mk in cands().items():
                m1 = mk().fit(tr[cols], tr[tgt]); m2 = mk().fit(trv[cols], trv[tgt])
                row[name] = (mean_absolute_error(va[tgt], m1.predict(va[cols])), mean_absolute_error(te[tgt], m2.predict(te[cols])))
            table[h] = row
        names = list(table[1])
        avg = {n: (np.mean([table[h][n][0] for h in T.HORIZONS]), np.mean([table[h][n][1] for h in T.HORIZONS])) for n in names}
        print(f"\n== {kind} ({cfg['target']}) 평균 오차(1~5년 평균, 낮을수록 좋음) - 검증(고르는 용) / 시험(최종 확인용)")
        for n, (v, t) in sorted(avg.items(), key=lambda kv: kv[1][0]): print(f"  {n:16s} 검증 {v:.4f} | 시험 {t:.4f}")
        best = {h: min(names, key=lambda n: table[h][n][0]) for h in T.HORIZONS}
        print("  시점별 검증 1등:", {h: best[h] for h in T.HORIZONS})
        res[kind] = {"avg": {n: [float(v), float(t)] for n, (v, t) in avg.items()}, "best_by_horizon": best}
    (T.ROOT / "ml/model_comparison.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")

if __name__ == "__main__": main()
