"""좌투·우투 상대 분석 (투수의 투구 손 구분).

타자가 좌투/우투를 상대할 때, 투수가 좌타/우타를 상대할 때의 기록을 따로 계산하고,
표본이 작아 흔들리는 값을 바로잡는 모델을 시간 순으로 나눠 비교한다.
 목표 1: 타석에서 출루(안타·볼넷·사구)했는가 → 로그손실(낮을수록 좋음)
 목표 2: 타석당 루타(안타 1, 2루타 2, 3루타 3, 홈런 4) → 평균제곱오차(낮을수록 좋음)
후보: 리그 평균(서는 쪽·투구 손 조합별) / 선수 기록 그대로 / 선수 전체 기록 보정 + 조합별 리그 차이 /
      그 위에 선수별 좌우 차이 보정 / 상대 투수 실력까지 반영 / 기계학습(CatBoost+LightGBM 평균)
"""
import numpy as np, pandas as pd

OBP_N = lambda d: d.h + d.bb + d.hbp
TB = lambda d: d.h + d.b2 + 2 * d.b3 + 3 * d.hr
CELL = ["stance", "phand"]


def metric_cols(pa):
    pa = pa.copy()
    pa["x_obp"] = (pa.h + pa.bb + pa.hbp) / pa.pa
    pa["x_tb"] = (pa.h + pa.b2 + 2 * pa.b3 + 3 * pa.hr) / pa.pa
    return pa


def stat_tables(tr, m):
    mu = tr[m].mean()
    cell = tr.groupby(CELL)[m].mean() - mu
    return mu, cell


def structured(tr, te, m, k1, k2, k3=None, gamma=1.0):
    """선수 전체 기록(보정) + 조합별 리그 차이 + 선수별 좌우 차이(보정) [+ 상대 투수 실력]"""
    mu, d = stat_tables(tr, m)
    gb = tr.groupby("batter")[m].agg(["sum", "count"]); base_b = (gb["sum"] + k1 * mu) / (gb["count"] + k1)
    gbc = tr.groupby(["batter"] + CELL)[m].agg(["sum", "count"])
    out = np.full(len(te), mu)
    bb = te.batter.map(base_b).fillna(mu).values
    dc = np.array([d.get((s, h), 0.0) for s, h in zip(te.stance, te.phand)])
    pred = bb + dc
    if k2 is not None:
        idx = pd.MultiIndex.from_arrays([te.batter, te.stance, te.phand])
        sub = gbc.reindex(idx)
        n = sub["count"].fillna(0).values; s_ = sub["sum"].fillna(0).values
        dev = np.where(n > 0, s_ / np.maximum(n, 1) - pred, 0.0)
        pred = pred + dev * n / (n + k2)
    if k3 is not None:
        gp = tr.groupby("pitcher")[m].agg(["sum", "count"]); base_p = (gp["sum"] + k3 * mu) / (gp["count"] + k3)
        pred = pred + gamma * (te.pitcher.map(base_p).fillna(mu).values - mu)
    return pred


def loss(m, y, p):
    if m == "x_obp":
        p = np.clip(p, 0.03, 0.9); return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))
    return float(np.mean((y - np.clip(p, 0, 4)) ** 2))


def split(pa):
    return pa[pa.date < "2026-08-01"], pa[(pa.date >= "2026-08-01") & (pa.date < "2026-09-01")], pa[pa.date >= "2026-09-01"]


def tune(tr, va, m, grid, **kw):
    best = None
    for g in grid:
        l = loss(m, va[m].values if m == "x_tb" else (va.h + va.bb + va.hbp).clip(upper=1).values, structured(tr, va, m, *g, **kw))
        if best is None or l < best[0]: best = (l, g)
    return best


def target(df, m):
    return ((df.h + df.bb + df.hbp).clip(upper=1).values if m == "x_obp" else TB(df).values.astype(float))


def gbm_feats(stat, rows, m, k1, k3, scale=1.0):
    """기계학습 입력: 선수·투수의 (보정한) 전체 비율, 서는 쪽별 비율, 표본 수, 조합별 리그 차이"""
    mu, d = stat_tables(stat, m)
    gb = stat.groupby("batter")[m].agg(["sum", "count"]); gbc = stat.groupby(["batter"] + CELL)[m].agg(["sum", "count"])
    gp = stat.groupby("pitcher")[m].agg(["sum", "count"]); gpc = stat.groupby(["pitcher", "stance"])[m].agg(["sum", "count"])
    sh = lambda t, key, k: ((t["sum"].reindex(key).fillna(0) + k * mu) / (t["count"].reindex(key).fillna(0) * scale + k)).values
    ib = rows.batter.values; ip = rows.pitcher.values
    cb = pd.MultiIndex.from_arrays([rows.batter, rows.stance, rows.phand]); cp = pd.MultiIndex.from_arrays([rows.pitcher, rows.stance])
    X = pd.DataFrame({
        "b_all": sh(gb, ib, k1), "b_cell": sh(gbc, cb, 40), "p_all": sh(gp, ip, k3), "p_cell": sh(gpc, cp, 60),
        "b_n": gb["count"].reindex(ib).fillna(0).values * scale, "bc_n": gbc["count"].reindex(cb).fillna(0).values * scale,
        "p_n": gp["count"].reindex(ip).fillna(0).values * scale,
        "d_cell": [d.get((s, h), 0.0) for s, h in zip(rows.stance, rows.phand)],
        "left": (rows.stance == "L").astype(int).values, "plh": (rows.phand == "L").astype(int).values, "same": (rows.stance == rows.phand).astype(int).values})
    return X


def gbm_train_feats(tr, m, k1, k3, folds=5, seed=0):
    """학습용: 자기 타석이 비율에 섞이지 않게 5조각 교차 계산"""
    f = np.random.RandomState(seed).randint(0, folds, len(tr)); parts = []
    for i in range(folds):
        x = gbm_feats(tr[f != i], tr[f == i], m, k1, k3, scale=folds / (folds - 1)); x.index = np.where(f == i)[0]; parts.append(x)
    return pd.concat(parts).sort_index()


def gbm_fit_predict(tr, te, m, k1, k3):
    import lightgbm as lgb
    from catboost import CatBoostClassifier, CatBoostRegressor
    Xtr, Xte = gbm_train_feats(tr, m, k1, k3), gbm_feats(tr, te, m, k1, k3)
    y = target(tr, m)
    if m == "x_obp":
        cb = CatBoostClassifier(iterations=400, depth=4, learning_rate=0.03, l2_leaf_reg=10, verbose=0, random_seed=0); cb.fit(Xtr, y)
        gb = lgb.LGBMClassifier(n_estimators=200, learning_rate=0.03, num_leaves=8, min_child_samples=200, subsample=0.8, subsample_freq=1, reg_lambda=10, verbose=-1); gb.fit(Xtr, y)
        return (cb.predict_proba(Xte)[:, 1] + gb.predict_proba(Xte)[:, 1]) / 2, (cb, gb)
    cb = CatBoostRegressor(iterations=400, depth=4, learning_rate=0.03, l2_leaf_reg=10, verbose=0, random_seed=0); cb.fit(Xtr, y)
    gb = lgb.LGBMRegressor(n_estimators=200, learning_rate=0.03, num_leaves=8, min_child_samples=200, subsample=0.8, subsample_freq=1, reg_lambda=10, verbose=-1); gb.fit(Xtr, y)
    return (cb.predict(Xte) + gb.predict(Xte)) / 2, (cb, gb)


def compare(pa):
    pa = metric_cols(pa)
    tr, va, te = split(pa); full = pd.concat([tr, va])
    res = {}; pick = {}
    K1, K2, K3 = [20, 60, 150, 400], [20, 60, 150, 400, 1000], [100, 300, 800]
    for m, name in (("x_obp", "출루"), ("x_tb", "루타")):
        yv, yt = target(va, m), target(te, m); r = {}
        mu, d = stat_tables(tr, m)
        r["리그 평균(서는 쪽·투구 손 조합별)"] = (loss(m, yv, np.array([mu + d.get((s, h), 0) for s, h in zip(va.stance, va.phand)])), None)
        r["선수 전체 기록 그대로(좌우 구분 없음)"] = (loss(m, yv, structured(tr, va, m, 1e-3, None) ), None)
        r["선수 좌우별 기록 그대로"] = (loss(m, yv, structured(tr, va, m, 1e-3, 1e-3)), None)
        b1 = tune(tr, va, m, [(k1, None) for k1 in K1]); r["선수 전체 기록 보정 + 조합별 리그 차이"] = (b1[0], b1[1])
        b2 = tune(tr, va, m, [(b1[1][0], k2) for k2 in K2]); r["+ 선수별 좌우 차이 보정"] = (b2[0], b2[1])
        b3 = tune(tr, va, m, [(b2[1][0], b2[1][1], k3) for k3 in K3]); r["+ 상대 투수 실력"] = (b3[0], b3[1])
        gp, _ = gbm_fit_predict(tr, va, m, b3[1][0], b3[1][2]); r["기계학습(CatBoost+LightGBM 평균)"] = (loss(m, yv, gp), None)
        # 시험(9월 이후): 검증에서 고른 설정으로 학습+검증 데이터를 써서
        t = {}
        t["리그 평균(서는 쪽·투구 손 조합별)"] = loss(m, yt, np.array([stat_tables(full, m)[0] + stat_tables(full, m)[1].get((s, h), 0) for s, h in zip(te.stance, te.phand)]))
        t["선수 전체 기록 그대로(좌우 구분 없음)"] = loss(m, yt, structured(full, te, m, 1e-3, None))
        t["선수 좌우별 기록 그대로"] = loss(m, yt, structured(full, te, m, 1e-3, 1e-3))
        t["선수 전체 기록 보정 + 조합별 리그 차이"] = loss(m, yt, structured(full, te, m, b1[1][0], None))
        t["+ 선수별 좌우 차이 보정"] = loss(m, yt, structured(full, te, m, *b2[1]))
        t["+ 상대 투수 실력"] = loss(m, yt, structured(full, te, m, *b3[1]))
        gpt, _ = gbm_fit_predict(full, te, m, b3[1][0], b3[1][2]); t["기계학습(CatBoost+LightGBM 평균)"] = loss(m, yt, gpt)
        res[name] = {k: {"val": round(v[0], 5), "test": round(t[k], 5)} for k, v in r.items()}
        pick[name] = {"k": b3[1]}
        best = min(r, key=lambda k: r[k][0]); pick[name]["best"] = best
    return res, pick, {"train": len(tr), "val": len(va), "test": len(te)}


def sums(d):
    return [int(d[c].sum()) for c in ["pa", "ab", "h", "b2", "b3", "hr", "bb", "hbp", "so", "sf"]]


def estimate(full, who, pick):
    """선수(타자=batter, 투수=pitcher)별 좌·우 상대 보정 출루/타석, 루타/타석. 상대 투수(타자) 실력은 평균으로 둔다."""
    out = {}
    for m, name in (("x_obp", "출루"), ("x_tb", "루타")):
        k1, k2, k3 = pick[name]["k"]
        df = full if who == "batter" else full.rename(columns={"batter": "pitcher", "pitcher": "batter"})
        key = "batter"
        rows = df[[key, "stance", "phand"]].drop_duplicates()
        # 타자: 상대 투수 손(L/R)별 / 투수: 상대 타자 서는 쪽(L/R)별 — 같은 표(서는 쪽, 투구 손) 조합 평균
        rows = rows.assign(pitcher=-1)
        p = structured(df, rows, m, k1, k2)          # 상대 실력 항은 평균(0)으로 둔다
        rows["p"] = p
        w = df.groupby([key, "stance", "phand"]).size().rename("w").reset_index()
        rows = rows.merge(w, on=[key, "stance", "phand"])
        by = "phand" if who == "batter" else "stance"
        for (pid, side), g in rows.groupby([key, by]):
            out.setdefault(int(pid), {}).setdefault(side, {})[m] = round(float(np.average(g.p, weights=g.w)), 4)
    return out


def add_to(pa, out, pick):
    pa = metric_cols(pa)
    full = pa
    est_b, est_p = estimate(full, "batter", pick), estimate(full, "pitcher", pick)
    for pid, g in pa.groupby("batter"):
        e = out["b"].get(str(pid))
        if e is None: continue
        e["pl"] = {h: sums(g[g.phand == h]) for h in "LR"}
        e["pe"] = {h: [est_b[pid][h]["x_obp"], est_b[pid][h]["x_tb"]] for h in "LR" if h in est_b.get(pid, {})}
    for pid, g in pa.groupby("pitcher"):
        e = out["p"].get(str(pid))
        if e is None: continue
        e["pl"] = {s: sums(g[g.stance == s]) for s in "LR"}
        e["hand"] = g.phand.iloc[0]
        e["pe"] = {s: [est_p[pid][s]["x_obp"], est_p[pid][s]["x_tb"]] for s in "LR" if s in est_p.get(pid, {})}
    for t, g in pa.groupby("bat"):
        out["t"].setdefault(t, {})["plb"] = {h: sums(g[g.phand == h]) for h in "LR"}
    for t, g in pa.groupby("fld"):
        out["t"].setdefault(t, {})["plf"] = {s: sums(g[g.stance == s]) for s in "LR"}
    out["meta"]["pl"] = {s + h: sums(pa[(pa.stance == s) & (pa.phand == h)]) for s in "LR" for h in "LR"}
    out["ph"] = {str(int(p)): h for p, h in pa.groupby("pitcher").phand.first().items()}
