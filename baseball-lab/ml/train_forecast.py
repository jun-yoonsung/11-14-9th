#!/usr/bin/env python3
"""선수 미래 성적(1~5년 뒤)과 현역 지속 확률(은퇴 시점) 예측 모델 학습.

데이터: Kaggle "KBO Player Stats 1982-2026" (netsong, CC BY-NC-SA 4.0) -> ml/raw/*.csv (재배포 금지라 GitHub에는 올리지 않음)
예측: 타자 OPS, 투수 ERA / 계속 현역일 확률.  결과: public/data/forecast.json (+ ml/metrics.json)

검증 방식(시간 순서): 예측 대상 시즌이 2023년 이하인 자료로 학습 -> 대상 시즌 2024~2026을 맞혀 본다. (미래 정보가 섞이지 않게)
비교 기준선: 작년 값 / 3년 가중평균(Marcel식) / 리그 평균.  머신러닝이 기준선보다 낫지 않으면 기준선을 쓴다.
사용: python3 ml/train_forecast.py
"""
import json, re, sys, warnings
from pathlib import Path
import numpy as np, pandas as pd
from xgboost import XGBClassifier
from catboost import CatBoostClassifier
from sklearn.ensemble import HistGradientBoostingRegressor, HistGradientBoostingClassifier
from models import Ens
from sklearn.metrics import mean_absolute_error, roc_auc_score, brier_score_loss

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parent.parent
RAW, OUT = ROOT / "ml/raw", ROOT / "public/data/forecast.json"
LAST = 2026                      # 데이터의 마지막 시즌
TEST_FROM, VAL_FROM = 2024, 2021  # 예측 대상 시즌 기준: 2024~ 시험, 2021~2023 검증(모델 선택)
HORIZONS = [1, 2, 3, 4, 5]
START = 1990                     # 학습에 쓰는 시작 시즌(너무 옛날 야구는 제외)


def ip_to_float(v):
    s = str(v).strip(); m = re.match(r"^(\d+)(?:\s+(\d)/3)?$", s)
    if m: return int(m.group(1)) + (int(m.group(2)) / 3 if m.group(2) else 0)
    m = re.match(r"^(\d)/3$", s)
    return int(m.group(1)) / 3 if m else np.nan


def static_features(raw):
    """선수 고정 정보(키·몸무게·좌우 타투·드래프트 순번)를 숫자로 바꾼다."""
    st = raw.groupby("Id").agg(HtWt=("HtWt", "first"), BatThrow=("BatThrow", "first"), Draft=("Draft", "first"))
    hw = st.HtWt.astype(str).str.extract(r"(\d+)cm/(\d+)kg").astype(float)
    st["height"], st["weight"] = hw[0], hw[1]
    bt = st.BatThrow.astype(str).str.extract(r"([LRS])/([LR])")
    st["bat"] = bt[0].map({"L": 0, "R": 1, "S": 2}); st["thr"] = bt[1].map({"L": 0, "R": 1})
    st["draft_pick"] = st.Draft.astype(str).str.extract(r"(\d+)순위")[0].astype(float)
    return st[["height", "weight", "bat", "thr", "draft_pick"]]


def load():
    b = pd.read_csv(RAW / "kbo_batting_stats_season_1982-2026.csv", low_memory=False)
    p = pd.read_csv(RAW / "kbo_pitching_stats_season_1982-2026.csv", low_memory=False)
    sb, sp = static_features(b), static_features(p)
    b = b.groupby(["Id", "Season"], as_index=False).agg(Player=("Player", "first"), Age=("Age", "first"), Born=("Born", "first"), Pos=("Position", "first"), Team=("Team", "last"),
        **{c: (c, "sum") for c in ["G", "PA", "AB", "H", "2B", "3B", "HR", "TB", "BB", "HBP", "SO", "SF", "SB"]})
    # Kaggle 2026 표에 없는 타자(대부분 타석이 매우 적은 선수)는 우리 사이트의 2026 기록으로 보충한다
    ours = pd.read_csv(ROOT / "public/data/batters.csv")
    miss = ours[~ours.pid.isin(b[b.Season == LAST].Id)]
    if len(miss):
        last = b.sort_values("Season").groupby("Id").tail(1).set_index("Id")
        add = pd.DataFrame({"Id": miss.pid.values, "Season": LAST, "Player": miss.name.values, "Pos": np.nan, "Team": miss.team.values, "Born": np.nan,
                            "G": miss.g.values, "PA": miss.pa.values, "AB": miss.ab.values, "H": miss.h.values, "2B": miss.d2.values, "3B": miss.d3.values, "HR": miss.hr.values,
                            "BB": miss.bb.values, "HBP": miss.hbp.values, "SO": miss.so.values, "SF": miss.sf.values, "SB": 0})
        add["TB"] = add.H + add["2B"] + 2 * add["3B"] + 3 * add.HR
        add["Age"] = [(last.Age[i] + (LAST - last.Season[i])) if i in last.index else np.nan for i in add.Id]   # 과거 기록이 있으면 나이를 이어서 계산, 없으면 모름
        b = pd.concat([b, add], ignore_index=True)
    b = b.merge(sb, left_on="Id", right_index=True, how="left")
    b["OBP"] = (b.H + b.BB + b.HBP) / (b.AB + b.BB + b.HBP + b.SF).replace(0, np.nan)
    b["SLG"] = b.TB / b.AB.replace(0, np.nan); b["OPS"] = b.OBP + b.SLG
    b["ISO"] = b.SLG - b.H / b.AB.replace(0, np.nan)
    b["K"] = b.SO / b.PA.replace(0, np.nan); b["BBr"] = b.BB / b.PA.replace(0, np.nan); b["HRr"] = b.HR / b.PA.replace(0, np.nan)
    p["IPf"] = p.IP.map(ip_to_float)
    p = p.groupby(["Id", "Season"], as_index=False).agg(Player=("Player", "first"), Age=("Age", "first"), Born=("Born", "first"), Team=("Team", "last"),
        **{c: (c, "sum") for c in ["G", "H", "HR", "BB", "HBP", "SO", "R", "ER", "TBF", "IPf", "W", "L", "SV"]})
    p = p.merge(sp, left_on="Id", right_index=True, how="left")
    ip = p.IPf.replace(0, np.nan)
    p["ERA"] = p.ER * 9 / ip; p["K9"] = p.SO * 9 / ip; p["BB9"] = p.BB * 9 / ip; p["HR9"] = p.HR * 9 / ip; p["WHIP"] = (p.BB + p.H) / ip; p["IPG"] = p.IPf / p.G.replace(0, np.nan)
    return b, p


CFG = {
    "batter": dict(target="OPS", stats=["OPS", "OBP", "SLG", "ISO", "K", "BBr", "HRr"], vol="PA", min_base=10, min_eval=50, min_target=100, reg=200,
                   weight=lambda d: d.PA),
    "pitcher": dict(target="ERA", stats=["ERA", "K9", "BB9", "HR9", "WHIP", "IPG"], vol="IPf", min_base=5, min_eval=20, min_target=30, reg=60,
                    weight=lambda d: d.IPf),
}


def build_rows(df, cfg, horizons):
    """선수-기준시즌(t)마다 최근 3시즌 기록, 나이, 경력, 리그 평균을 특성으로 만들고 t+h의 값을 정답으로 붙인다."""
    vol = cfg["vol"]; st = cfg["stats"]
    df = df[df.Season >= START - 2].copy()
    lg = df[df[vol] >= cfg["min_target"]].groupby("Season")[st].mean().add_prefix("lg_")
    last_season = df.groupby("Id").Season.max().rename("last_season")
    first_season = df.groupby("Id").Season.min().rename("first_season")
    base = df.set_index(["Id", "Season"])
    STATIC = ["height", "weight", "bat", "thr", "draft_pick"]
    rows = base[[*st, vol, "Age"]].copy()
    rows = rows.join(base[["G"]], rsuffix="_g") if "G" not in rows else rows
    idx = rows.index.to_frame(index=False)
    X = pd.DataFrame({"Id": idx.Id.values, "t": idx.Season.values})
    for k in (0, 1, 2):
        key = pd.MultiIndex.from_arrays([X.Id, X.t - k])
        sub = base.reindex(key)
        for c in [*st, vol]:
            X[f"{c}_{k}"] = sub[c].values
    X["age"] = base.loc[list(zip(X.Id, X.t)), "Age"].values
    for c in STATIC: X[c] = base.loc[list(zip(X.Id, X.t)), c].values
    if "Pos" in base: X["pos"] = pd.Categorical(base.loc[list(zip(X.Id, X.t)), "Pos"].values).codes
    X = X.merge(last_season, left_on="Id", right_index=True).merge(first_season, left_on="Id", right_index=True)
    X["career_years"] = X.t - X.first_season + 1
    cnt = df.sort_values(["Id", "Season"]).assign(n=lambda d: d.groupby("Id").cumcount() + 1).set_index(["Id", "Season"]).n
    X["gap_years"] = X.career_years - cnt.reindex(pd.MultiIndex.from_arrays([X.Id, X.t])).values   # 중간에 기록이 없는 시즌 수(부상·군 복무 등)
    cum = df.sort_values(["Id", "Season"]).assign(cumvol=lambda d: d.groupby("Id")[vol].cumsum()).set_index(["Id", "Season"]).cumvol
    X["career_vol"] = cum.reindex(pd.MultiIndex.from_arrays([X.Id, X.t])).values
    X = X.merge(lg, left_on="t", right_index=True, how="left")
    X["seasons_in_3"] = X[[f"{vol}_{k}" for k in (0, 1, 2)]].notna().sum(axis=1)
    # 목표값: t+h 시즌의 기록(표본이 충분할 때만) / 현역 여부(마지막 시즌이 t+h 이상)
    for h in horizons:
        key = pd.MultiIndex.from_arrays([X.Id, X.t + h])
        sub = base.reindex(key)
        ok = sub[vol].values >= cfg["min_target"]
        X[f"y{h}"] = np.where(ok, sub[cfg["target"]].values, np.nan)
        X[f"act{h}"] = np.where(X.t + h <= LAST, (X.last_season >= X.t + h).astype(float), np.nan)
    return X[(X.t >= START) & (X[f"{vol}_0"] >= cfg["min_base"])].reset_index(drop=True), base, lg


def feature_cols(X, cfg):
    skip = {"Id", "t", "last_season", "first_season"} | {c for c in X if re.match(r"^(y|act)\d$", c)}
    return [c for c in X.columns if c not in skip]


def baselines(X, cfg, h):
    """기준선 예측: 작년 값 / 3년 가중평균을 리그 평균 쪽으로 당긴 값(Marcel식) / 리그 평균."""
    s, v = cfg["target"], cfg["vol"]
    last = X[f"{s}_0"]
    w = np.array([5, 4, 3]); num = den = 0
    for k in range(3):
        vv = X[f"{v}_{k}"].fillna(0).values; xx = X[f"{s}_{k}"].fillna(0).values
        num = num + w[k] * vv * xx; den = den + w[k] * vv
    lgm = X[f"lg_{s}"]
    marcel = (num + cfg["reg"] * 3 * lgm) / (den + cfg["reg"] * 3)
    return {"last": last.values, "marcel": marcel.values, "league": lgm.values}


def widen(mid, lo, hi, k):
    """예측 구간을 중앙값 기준으로 k배 넓힌다(양끝이 뒤집히면 바로잡는다)."""
    l, u = np.minimum(lo, hi), np.maximum(lo, hi); mid = np.clip(mid, l, u)
    return mid - (mid - l) * k, mid + (u - mid) * k


def calibrate(y, mid, lo, hi, target=0.8):
    """검증 구간에서 80%가 구간 안에 들어오는 가장 작은 배율을 찾는다."""
    for k in np.arange(1.0, 3.01, 0.05):
        l, u = widen(mid, lo, hi, k)
        if np.mean((y >= l) & (y <= u)) >= target: return float(k)
    return 3.0


# 중앙값 예측 모델: ml/compare_models.py 에서 검증 구간(2021~2023) 오차가 가장 작았던 구성
# 모델 선택: ml/compare_models.py, compare_ensembles.py의 검증 구간(2021~2023) 결과 1등
MID_MODELS = {"batter": ["ExtraTrees", "XGBoost", "CatBoost", "신경망(MLP)"], "pitcher": ["CatBoost(MAE)"]}   # 2026-11 재비교(CatBoost·신경망 추가) 결과


def make_clf(kind):
    """현역 확률 분류기: 타자는 HGB, 투수는 CatBoost(깊게) (ml/compare_classifiers.py 검증 구간 1등)."""
    if kind == "pitcher":
        return CatBoostClassifier(iterations=600, depth=6, learning_rate=0.04, l2_leaf_reg=8, rsm=0.7, random_seed=0, verbose=0, thread_count=4)
    return HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=200, min_samples_leaf=40, l2_regularization=1.0, random_state=0)


def split(d, h, cfg):
    """학습(~2020) / 보정(2021~2023) / 시험(2024~) / 시험 전까지 전부. 보정·시험은 기준 시즌 출전이 충분한 선수만(정확도는 정규 출전 선수 기준)."""
    ok = d[f"{cfg['vol']}_0"] >= cfg["min_eval"]
    return d[d.t + h < VAL_FROM], d[(d.t + h >= VAL_FROM) & (d.t + h < TEST_FROM) & ok], d[(d.t + h >= TEST_FROM) & ok], d[d.t + h < TEST_FROM]


def fit_reg(Xtr, ytr, q=None):
    kw = dict(max_depth=3, learning_rate=0.05, max_iter=250, min_samples_leaf=40, l2_regularization=1.0, random_state=0)
    return HistGradientBoostingRegressor(loss="quantile", quantile=q, **kw) if q else HistGradientBoostingRegressor(**kw)


def run(kind, cfg, b_or_p, with_act=True):
    X, base, lg = build_rows(b_or_p, cfg, HORIZONS)
    cols = feature_cols(X, cfg)
    metrics = {"reg": {}, "act": {}}
    models = {}
    for h in HORIZONS:
        tgt = f"y{h}"; d = X[X[tgt].notna()]
        tr, cal, te, _ = split(d, h, cfg)
        # 학습(~2020) -> 구간 폭 보정(2021~2023) -> 시험(2024~2026): 시험 구간은 학습·보정에 전혀 쓰지 않는다
        m = Ens(MID_MODELS[kind]).fit(tr[cols], tr[tgt])
        lo = fit_reg(tr[cols], tr[tgt], 0.1).fit(tr[cols], tr[tgt]); hi = fit_reg(tr[cols], tr[tgt], 0.9).fit(tr[cols], tr[tgt])
        scale = calibrate(cal[tgt].values, m.predict(cal[cols]), lo.predict(cal[cols]), hi.predict(cal[cols]))
        pr = m.predict(te[cols]); bl = baselines(te, cfg, h); blc = baselines(cal, cfg, h)
        fill = lambda v: np.nan_to_num(v, nan=np.nanmean(v))
        # 검증 구간(2021~2023)에서 오차가 가장 작은 방법(ML / 3년 가중평균 / 리그 평균)을 고른다. 시험 구간은 고르는 데 쓰지 않는다.
        mae_cal = {"ml": mean_absolute_error(cal[tgt], m.predict(cal[cols])), "marcel": mean_absolute_error(cal[tgt], fill(blc["marcel"])), "league": mean_absolute_error(cal[tgt], fill(blc["league"]))}
        chosen = min(mae_cal, key=mae_cal.get)
        resq = (0.0, 0.0)
        if chosen == "ml":
            tmid = pr; tlo, thi = widen(pr, lo.predict(te[cols]), hi.predict(te[cols]), scale)
        else:
            q = np.quantile(cal[tgt].values - fill(blc[chosen]), [0.1, 0.9]); resq = (float(q[0]), float(q[1]))
            tmid = fill(bl[chosen]); tlo, thi = tmid + resq[0], tmid + resq[1]
        cover = float(np.mean((te[tgt].values >= tlo) & (te[tgt].values <= thi)))
        e = {"n_test": int(len(te)), "chosen": chosen, "mae_chosen": float(mean_absolute_error(te[tgt], tmid)), "mae_ml": float(mean_absolute_error(te[tgt], pr)),
             **{f"mae_{k}": float(mean_absolute_error(te[tgt], fill(v))) for k, v in bl.items()}, "coverage80": cover}
        e["interval_scale"] = float(scale); metrics["reg"][h] = e
        # 현역 지속 확률 (다른 지표 예측에서는 건너뛴다)
        a = X[X[f"act{h}"].notna()]; atr = a[a.t + h < TEST_FROM]; ate = a[(a.t + h >= TEST_FROM) & (a[f"{cfg['vol']}_0"] >= cfg["min_eval"])]
        if with_act:
          clf = make_clf(kind).fit(atr[cols], atr[f"act{h}"])
          pa = clf.predict_proba(ate[cols])[:, 1]
          metrics["act"][h] = {"n_test": int(len(ate)), "auc": float(roc_auc_score(ate[f"act{h}"], pa)), "brier": float(brier_score_loss(ate[f"act{h}"], pa)),
                               "brier_base": float(brier_score_loss(ate[f"act{h}"], np.full(len(ate), atr[f"act{h}"].mean()))), "base_rate_test": float(ate[f"act{h}"].mean())}
        # 최종 모델: 정답이 있는 모든 자료로 다시 학습
        full = d; fa = a
        models[h] = dict(scale=scale, chosen=chosen, resq=resq,
            mid=Ens(MID_MODELS[kind]).fit(full[cols], full[tgt]),
            lo=fit_reg(full[cols], full[tgt], 0.1).fit(full[cols], full[tgt]), hi=fit_reg(full[cols], full[tgt], 0.9).fit(full[cols], full[tgt]),
            act=make_clf(kind).fit(fa[cols], fa[f"act{h}"]) if with_act else None)
    return X, cols, metrics, models


def main():
    b, p = load()
    out = {"meta": {"source": "Kaggle: netsong / KBO Player Stats 1982-2026 (CC BY-NC-SA 4.0), KBO 공식 기록 기반", "base_season": LAST, "horizons": HORIZONS,
                    "validation": f"예측 대상 시즌 {TEST_FROM}~{LAST}를 시험용으로 떼어 두고, 그 전 자료로만 학습해 측정", "metrics": {}}, "players": {}}
    for kind, df in (("batter", b), ("pitcher", p)):
        cfg = CFG[kind]; X, cols, metrics, models = run(kind, cfg, df)
        out["meta"]["metrics"][kind] = {"target": cfg["target"], "model": MID_MODELS[kind], **metrics}
        cur = X[X.t == LAST]
        info = df[df.Season == LAST].set_index("Id")
        pred = {}
        for h in HORIZONS:
            M = models[h]
            if M["chosen"] == "ml":
                lo_, hi_ = widen(M["mid"].predict(cur[cols]), M["lo"].predict(cur[cols]), M["hi"].predict(cur[cols]), M["scale"]); mid_ = np.clip(M["mid"].predict(cur[cols]), lo_, hi_)
            else:
                v = baselines(cur, cfg, h)[M["chosen"]]; mid_ = np.nan_to_num(v, nan=np.nanmean(v)); lo_, hi_ = mid_ + M["resq"][0], mid_ + M["resq"][1]
            pred[h] = dict(mid=mid_, lo=lo_, hi=hi_, act=M["act"].predict_proba(cur[cols])[:, 1])
        for i, (_, r) in enumerate(cur.iterrows()):
            pid = int(r.Id); known_age = not np.isnan(r.age); surv = np.minimum.accumulate([pred[h]["act"][i] for h in HORIZONS])   # 현역 확률은 줄기만 한다
            ys = []
            for j, h in enumerate(HORIZONS):
                lo, hi, mid = float(pred[h]["lo"][i]), float(pred[h]["hi"][i]), float(pred[h]["mid"][i])
                ys.append({"h": h, "year": LAST + h, "age": int(r.age) + h if known_age else None, "mid": round(mid, 3), "lo": round(lo, 3), "hi": round(hi, 3), "active": round(float(surv[j]), 3), "method": models[h]["chosen"]})
            half = next((y["age"] for y in ys if y["active"] < 0.5 and y["age"] is not None), None)
            out["players"][str(pid)] = {"type": kind, "name": str(info.loc[pid, "Player"]), "age": int(r.age) if known_age else None, "small": bool(r[f"{cfg['vol']}_0"] < cfg["min_eval"]), "now": round(float(r[f"{cfg['target']}_0"]), 3), "pred": ys,
                                        "retire_by": half}   # 현역 확률이 50% 아래로 내려가는 첫 나이(5년 안에 없으면 None)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (ROOT / "ml/metrics.json").write_text(json.dumps(out["meta"], ensure_ascii=False, indent=1), encoding="utf-8")
    for kind in ("batter", "pitcher"):
        m = out["meta"]["metrics"][kind]; print(f"\n== {kind} ({m['target']}) 시험 구간 MAE (낮을수록 좋음)")
        for h in HORIZONS:
            e = m["reg"][h]; print(f"  {h}년 뒤  선택 {e['chosen']:6s} {e['mae_chosen']:.3f} | ML {e['mae_ml']:.3f} | 작년값 {e['mae_last']:.3f} | 3년가중 {e['mae_marcel']:.3f} | 리그평균 {e['mae_league']:.3f} | 80%구간 적중 {e['coverage80']:.0%} (n={e['n_test']})")
        print("  현역 지속 확률: " + ", ".join(f"{h}년 AUC {m['act'][h]['auc']:.2f}/Brier {m['act'][h]['brier']:.3f}(기준 {m['act'][h]['brier_base']:.3f})" for h in HORIZONS))
    print(f"\n예측 선수 {len(out['players'])}명 -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
