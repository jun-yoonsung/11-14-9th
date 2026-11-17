#!/usr/bin/env python3
"""현역 지속 확률 모델 후보 비교(Brier 점수, 낮을수록 좋음). 검증(2021~2023)으로 고르고 시험(2024~2026)은 확인용."""
import sys, warnings
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent)); warnings.filterwarnings("ignore")
import train_forecast as T
from sklearn.ensemble import HistGradientBoostingClassifier as HGBC, RandomForestClassifier, ExtraTreesClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import brier_score_loss, roc_auc_score

def cands():
    imp = lambda: SimpleImputer(strategy="median")
    return {
        "로지스틱": lambda: make_pipeline(imp(), StandardScaler(), LogisticRegression(C=0.3, max_iter=500)),
        "랜덤포레스트": lambda: make_pipeline(imp(), RandomForestClassifier(n_estimators=300, min_samples_leaf=20, max_features=0.5, n_jobs=-1, random_state=0)),
        "ExtraTrees": lambda: make_pipeline(imp(), ExtraTreesClassifier(n_estimators=300, min_samples_leaf=20, max_features=0.6, n_jobs=-1, random_state=0)),
        "HGB(현재)": lambda: HGBC(max_depth=3, learning_rate=0.05, max_iter=200, min_samples_leaf=40, l2_regularization=1.0, random_state=0),
        "HGB(얕게)": lambda: HGBC(max_depth=2, learning_rate=0.05, max_iter=250, min_samples_leaf=60, l2_regularization=3.0, random_state=0),
    }

def main():
    b, p = T.load()
    for kind, df in (("batter", b), ("pitcher", p)):
        cfg = T.CFG[kind]; X, _, _ = T.build_rows(df, cfg, T.HORIZONS); cols = T.feature_cols(X, cfg); sc = {}
        for h in T.HORIZONS:
            a = X[X[f"act{h}"].notna()]; y = f"act{h}"
            tr = a[a.t + h < T.VAL_FROM]; va = a[(a.t + h >= T.VAL_FROM) & (a.t + h < T.TEST_FROM)]; te = a[a.t + h >= T.TEST_FROM]; trv = a[a.t + h < T.TEST_FROM]
            for n, mk in cands().items():
                pv = mk().fit(tr[cols], tr[y]).predict_proba(va[cols])[:, 1]; pt = mk().fit(trv[cols], trv[y]).predict_proba(te[cols])[:, 1]
                sc.setdefault(n, []).append((brier_score_loss(va[y], pv), brier_score_loss(te[y], pt), roc_auc_score(te[y], pt)))
        print(f"\n== {kind} 현역 지속 확률 (1~5년 평균)  검증 Brier | 시험 Brier | 시험 AUC")
        for n, v in sorted(sc.items(), key=lambda kv: np.mean([x[0] for x in kv[1]])): m = np.mean(v, 0); print(f"  {n:10s} {m[0]:.4f} | {m[1]:.4f} | {m[2]:.3f}")

if __name__ == "__main__": main()
