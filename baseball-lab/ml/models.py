"""예측 모델 후보(비교 스크립트와 학습 스크립트가 같이 쓴다)."""
import torch   # macOS에서 xgboost·lightgbm과 OpenMP가 겹쳐 죽는 일을 막으려고 가장 먼저 불러온다
torch.set_num_threads(1)
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor as HGB, RandomForestRegressor, ExtraTreesRegressor
from sklearn.linear_model import RidgeCV
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor
from lightgbm import LGBMRegressor
from catboost import CatBoostRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.compose import TransformedTargetRegressor

class GRUReg:
    """선수별 시계열 모델: 최근 3시즌(2년 전→작년→올해) 기록을 순서대로 GRU에 넣고, 나이·경력 같은 고정 정보와 합쳐 예측한다(MAE 손실)."""
    def __init__(self, hidden=32, epochs=60, seed=0): self.hidden, self.epochs, self.seed = hidden, epochs, seed
    def _split(self, X):
        import re
        if not hasattr(self, "seq"):
            groups = {}
            for c in X.columns:
                m = re.match(r"^(.+)_([012])$", c)
                if m and not c.startswith("lg_"): groups.setdefault(m.group(1), {})[int(m.group(2))] = c
            self.seq = [g for g in groups.values() if len(g) == 3]; used = {c for g in self.seq for c in g.values()}
            self.stat = [c for c in X.columns if c not in used]
        S = np.stack([X[[g[k] for g in self.seq]].values.astype(float) for k in (2, 1, 0)], axis=1)   # (표본, 3시즌, 특성)
        return S, X[self.stat].values.astype(float)
    def _prep(self, S, T, fit=False):
        if fit:
            self.ms, self.ss = np.nanmedian(S.reshape(-1, S.shape[2]), 0), np.nanstd(S.reshape(-1, S.shape[2]), 0) + 1e-6
            self.mt, self.st = np.nanmedian(T, 0), np.nanstd(T, 0) + 1e-6
        S = np.where(np.isnan(S), self.ms, S); S = (S - self.ms) / self.ss
        T = np.where(np.isnan(T), self.mt, T); T = (T - self.mt) / self.st
        return np.nan_to_num(S).astype("float32"), np.nan_to_num(T).astype("float32")
    def fit(self, X, y):
        import torch, torch.nn as nn
        torch.manual_seed(self.seed); np.random.seed(self.seed)
        S, T = self._split(X); S, T = self._prep(S, T, True); y = np.asarray(y, float); self.ym, self.ys = y.mean(), y.std() + 1e-9
        yy = ((y - self.ym) / self.ys).astype("float32")
        class Net(nn.Module):
            def __init__(s, nf, nt, h):
                super().__init__(); s.gru = nn.GRU(nf, h, batch_first=True); s.head = nn.Sequential(nn.Linear(h + nt, 32), nn.ReLU(), nn.Dropout(0.1), nn.Linear(32, 1))
            def forward(s, a, b): o, _ = s.gru(a); return s.head(torch.cat([o[:, -1], b], 1)).squeeze(1)
        self.net = Net(S.shape[2], T.shape[1], self.hidden); opt = torch.optim.AdamW(self.net.parameters(), lr=0.003, weight_decay=1e-3)
        n = len(yy); idx = np.random.permutation(n); nv = max(1, n // 10); va, tr = idx[:nv], idx[nv:]
        St, Tt, yt = map(torch.tensor, (S, T, yy)); best, bad, state = 1e9, 0, None
        for ep in range(self.epochs):
            self.net.train(); p = np.random.permutation(tr)
            for i in range(0, len(p), 256):
                b = p[i:i + 256]; opt.zero_grad(); loss = (self.net(St[b], Tt[b]) - yt[b]).abs().mean(); loss.backward(); opt.step()
            self.net.eval()
            with torch.no_grad(): v = (self.net(St[va], Tt[va]) - yt[va]).abs().mean().item()
            if v < best - 1e-4: best, bad, state = v, 0, {k: x.clone() for k, x in self.net.state_dict().items()}
            else:
                bad += 1
                if bad >= 8: break
        self.net.load_state_dict(state); return self
    def predict(self, X):
        import torch
        S, T = self._split(X); S, T = self._prep(S, T); self.net.eval()
        with torch.no_grad(): return self.net(torch.tensor(S), torch.tensor(T)).numpy() * self.ys + self.ym
    def get_params(self, deep=True): return {"hidden": self.hidden, "epochs": self.epochs, "seed": self.seed}

def cands():
    return {
        "Ridge(선형)": lambda: make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), RidgeCV(alphas=np.logspace(-1, 3, 9))),
        "랜덤포레스트": lambda: make_pipeline(SimpleImputer(strategy="median"), RandomForestRegressor(n_estimators=300, min_samples_leaf=15, max_features=0.5, n_jobs=-1, random_state=0)),
        "ExtraTrees": lambda: make_pipeline(SimpleImputer(strategy="median"), ExtraTreesRegressor(n_estimators=300, min_samples_leaf=15, max_features=0.6, n_jobs=-1, random_state=0)),
        "HGB(현재)": lambda: HGB(max_depth=3, learning_rate=0.05, max_iter=250, min_samples_leaf=40, l2_regularization=1.0, random_state=0),
        "HGB(얕고 느리게)": lambda: HGB(max_depth=2, learning_rate=0.03, max_iter=300, min_samples_leaf=60, l2_regularization=3.0, random_state=0),
        "HGB(깊게)": lambda: HGB(max_depth=5, learning_rate=0.03, max_iter=200, min_samples_leaf=30, l2_regularization=2.0, random_state=0),
        "XGBoost": lambda: XGBRegressor(n_estimators=300, max_depth=3, learning_rate=0.03, subsample=0.8, colsample_bytree=0.8, min_child_weight=10, reg_lambda=3.0, n_jobs=4, random_state=0),
        "XGBoost(MAE)": lambda: XGBRegressor(objective="reg:absoluteerror", n_estimators=300, max_depth=3, learning_rate=0.03, subsample=0.8, colsample_bytree=0.8, min_child_weight=10, reg_lambda=3.0, n_jobs=4, random_state=0),
        "LightGBM": lambda: LGBMRegressor(n_estimators=300, max_depth=3, num_leaves=8, learning_rate=0.03, subsample=0.8, subsample_freq=1, colsample_bytree=0.8, min_child_samples=30, reg_lambda=3.0, n_jobs=4, random_state=0, verbose=-1),
        "LightGBM(MAE)": lambda: LGBMRegressor(objective="l1", n_estimators=300, max_depth=3, num_leaves=8, learning_rate=0.03, subsample=0.8, subsample_freq=1, colsample_bytree=0.8, min_child_samples=30, reg_lambda=3.0, n_jobs=4, random_state=0, verbose=-1),
        "CatBoost": lambda: CatBoostRegressor(iterations=500, depth=4, learning_rate=0.04, l2_leaf_reg=5, rsm=0.8, random_seed=0, verbose=0, thread_count=4),
        "CatBoost(MAE)": lambda: CatBoostRegressor(loss_function="MAE", iterations=500, depth=4, learning_rate=0.04, l2_leaf_reg=5, rsm=0.8, random_seed=0, verbose=0, thread_count=4),
        "CatBoost(깊게)": lambda: CatBoostRegressor(iterations=800, depth=6, learning_rate=0.03, l2_leaf_reg=8, rsm=0.7, random_seed=0, verbose=0, thread_count=4),
        "신경망(MLP)": lambda: make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), TransformedTargetRegressor(regressor=MLPRegressor(hidden_layer_sizes=(64, 32), alpha=0.05, learning_rate_init=0.003, max_iter=400, early_stopping=True, n_iter_no_change=20, random_state=0), transformer=StandardScaler())),
        "시계열(GRU)": lambda: GRUReg(),
        "ExtraTrees(큰)": lambda: make_pipeline(SimpleImputer(strategy="median"), ExtraTreesRegressor(n_estimators=800, min_samples_leaf=10, max_features=0.5, n_jobs=-1, random_state=0)),
        "HGB(MAE 손실)": lambda: HGB(loss="absolute_error", max_depth=3, learning_rate=0.05, max_iter=250, min_samples_leaf=40, l2_regularization=1.0, random_state=0),
    }



class Ens:
    """여러 모델의 예측 평균(앙상블)."""
    def __init__(self, names): self.names, self.ms = names, []
    def fit(self, X, y):
        c = cands(); self.ms = [c[n]().fit(X, y) for n in self.names]; return self
    def predict(self, X): return np.mean([m.predict(X) for m in self.ms], axis=0)
