"""예측 모델 후보(비교 스크립트와 학습 스크립트가 같이 쓴다)."""
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
        "ExtraTrees(큰)": lambda: make_pipeline(SimpleImputer(strategy="median"), ExtraTreesRegressor(n_estimators=800, min_samples_leaf=10, max_features=0.5, n_jobs=-1, random_state=0)),
        "HGB(MAE 손실)": lambda: HGB(loss="absolute_error", max_depth=3, learning_rate=0.05, max_iter=250, min_samples_leaf=40, l2_regularization=1.0, random_state=0),
    }



class Ens:
    """여러 모델의 예측 평균(앙상블)."""
    def __init__(self, names): self.names, self.ms = names, []
    def fit(self, X, y):
        c = cands(); self.ms = [c[n]().fit(X, y) for n in self.names]; return self
    def predict(self, X): return np.mean([m.predict(X) for m in self.ms], axis=0)
