"""예측 모델 후보(비교 스크립트와 학습 스크립트가 같이 쓴다)."""
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor as HGB, RandomForestRegressor, ExtraTreesRegressor
from sklearn.linear_model import RidgeCV
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor
from lightgbm import LGBMRegressor

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
        "HGB(MAE 손실)": lambda: HGB(loss="absolute_error", max_depth=3, learning_rate=0.05, max_iter=250, min_samples_leaf=40, l2_regularization=1.0, random_state=0),
    }



class Ens:
    """여러 모델의 예측 평균(앙상블)."""
    def __init__(self, names): self.names, self.ms = names, []
    def fit(self, X, y):
        c = cands(); self.ms = [c[n]().fit(X, y) for n in self.names]; return self
    def predict(self, X): return np.mean([m.predict(X) for m in self.ms], axis=0)
