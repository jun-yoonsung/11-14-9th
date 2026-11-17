#!/usr/bin/env python3
"""팀 승률 예측(향후 1~3년)과 팀 역대 성적표를 public/data/team_forecast.json 으로 만든다.
팀 성적은 선수 기록 표(Kaggle KBO Player Stats 1982-2026)를 팀·시즌별로 합쳐 만든다: 승패=투수 승·패 합, 득점=타자 득점 합, 실점=투수 실점 합.
시간 순서 검증: 학습(예측 대상 ~2012) → 후보 선택·구간 보정(2013~2018) → 시험(2019~2026)."""
import json, sys, warnings
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.linear_model import Ridge
from sklearn.ensemble import ExtraTreesRegressor
sys.path.insert(0, str(Path(__file__).parent)); warnings.filterwarnings("ignore")
import train_forecast as T

# 구단 이름이 바뀐 팀은 같은 구단으로 이어 붙인다(KBO 공식 연고·계보 기준 약식)
FRANCHISE = {"OB": "두산", "MBC": "LG", "해태": "KIA", "빙그레": "한화", "SK": "SSG", "넥센": "키움", "우리": "키움", "히어로즈": "키움", "청보": "삼미", "태평양": "삼미"}
HORIZONS = [1, 2, 3]; VAL_FROM, TEST_FROM = 2013, 2019

def team_table():
    b, p = T.load(); p = p[p.Season >= 1982]
    pt = p.groupby(["Season", "Team"], as_index=False).agg(W=("W", "sum"), L=("L", "sum"), RA=("R", "sum"), SV=("SV", "sum"))
    raw = pd.read_csv(T.RAW / "kbo_batting_stats_season_1982-2026.csv", low_memory=False)
    bt = raw.groupby(["Season", "Team"], as_index=False).agg(RS=("R", "sum"))
    t = pt.merge(bt, on=["Season", "Team"], how="inner")
    t["Franchise"] = t.Team.map(lambda x: FRANCHISE.get(x, x))
    t = t.groupby(["Season", "Franchise"], as_index=False).agg(W=("W", "sum"), L=("L", "sum"), RA=("RA", "sum"), RS=("RS", "sum"))
    t = t[(t.W + t.L) > 40]
    t["wp"] = t.W / (t.W + t.L); t["pyth"] = t.RS ** 1.83 / (t.RS ** 1.83 + t.RA ** 1.83)
    return t.sort_values(["Franchise", "Season"]).reset_index(drop=True)

def rows(t, h):
    out = []
    for f, g in t.groupby("Franchise"):
        g = g.set_index("Season")
        for s in g.index:
            y = g.wp.get(s + h)
            if y is None or np.isnan(y): continue
            w = [g.wp.get(s - k, np.nan) for k in range(3)]; py = [g.pyth.get(s - k, np.nan) for k in range(3)]
            n = sum(~np.isnan(w))
            out.append(dict(Franchise=f, t=s, y=y, wp0=w[0], wp1=0.5 if np.isnan(w[1]) else w[1], wp2=0.5 if np.isnan(w[2]) else w[2], py0=py[0], py1=0.5 if np.isnan(py[1]) else py[1], n=n))
    return pd.DataFrame(out)

FEATS = ["wp0", "wp1", "wp2", "py0", "py1"]

def baselines(d):
    return {"last": d.wp0.values, "pyth": d.py0.values, "avg3": ((d.wp0 + d.wp1 + d.wp2) / 3).values, "league": np.full(len(d), 0.5),
            "shrunk": (0.5 + 0.55 * ((d.wp0 * 3 + d.wp1 * 2 + d.wp2) / 6 - 0.5)).values}

def models():
    return {"Ridge": lambda: Ridge(alpha=3.0), "ExtraTrees": lambda: ExtraTreesRegressor(n_estimators=300, min_samples_leaf=8, random_state=0, n_jobs=4)}

def mae(a, b): return float(np.mean(np.abs(np.asarray(a) - np.asarray(b))))

def main():
    t = team_table(); cur = t[t.Season == T.LAST].Franchise.tolist()
    base_now = t[t.Season == T.LAST].set_index("Franchise")
    out = {"meta": {"source": "Kaggle: netsong / KBO Player Stats 1982-2026 (CC BY-NC-SA 4.0)을 팀·시즌별로 합산", "base_season": T.LAST, "horizons": HORIZONS, "games": 144, "validation": {}},
           "teams": {}, "history": {}}
    for f in cur:
        g = t[t.Franchise == f]; out["history"][f] = [[int(x.Season), int(x.W), int(x.L), int(x.RS), int(x.RA), round(float(x.wp), 3)] for x in g.itertuples()]
    for h in HORIZONS:
        d = rows(t, h); d = d[d.n >= 2]
        tr = d[d.t + h < VAL_FROM]; va = d[(d.t + h >= VAL_FROM) & (d.t + h < TEST_FROM)]; te = d[d.t + h >= TEST_FROM]; trv = d[d.t + h < TEST_FROM]
        cand = {k: (lambda dd, v=v: v) for k, v in baselines(d).items()}
        res = {}
        for name, mk in models().items():
            res[name] = (mae(va.y, mk().fit(tr[FEATS], tr.y).predict(va[FEATS])), mae(te.y, mk().fit(trv[FEATS], trv.y).predict(te[FEATS])))
        for name in baselines(d):
            res[name] = (mae(va.y, baselines(va)[name]), mae(te.y, baselines(te)[name]))
        best = min(res, key=lambda k: res[k][0])
        def predict(dd, fit_on):
            if best in models(): return models()[best]().fit(fit_on[FEATS], fit_on.y).predict(dd[FEATS])
            return baselines(dd)[best]
        # 80% 구간: 검증 구간 잔차의 10·90% 분위수(작은 표본이라 시험 구간에서 실제 적중도 같이 기록)
        resid = va.y.values - predict(va, tr); q10, q90 = np.quantile(resid, [0.1, 0.9])
        tp = predict(te, trv); cover = float(np.mean((te.y.values >= tp + q10) & (te.y.values <= tp + q90)))
        out["meta"]["validation"][str(h)] = {"chosen": best, "n_test": int(len(te)), "mae": {k: {"val": round(v[0], 4), "test": round(v[1], 4)} for k, v in res.items()}, "coverage80": round(cover, 3)}
        print(f"{h}년 뒤 선택 {best:8s} 시험 MAE {res[best][1]:.4f} | 작년값 {res['last'][1]:.4f} | 평균회귀 {res['shrunk'][1]:.4f} | 80%구간 적중 {cover:.0%} (n={len(te)})")
        full = d
        for f in cur:
            g = t[t.Franchise == f].set_index("Season")
            if T.LAST not in g.index: continue
            w = [g.wp.get(T.LAST - k, np.nan) for k in range(3)]; py = [g.pyth.get(T.LAST - k, np.nan) for k in range(3)]
            x = pd.DataFrame([dict(wp0=w[0], wp1=0.5 if np.isnan(w[1]) else w[1], wp2=0.5 if np.isnan(w[2]) else w[2], py0=py[0], py1=0.5 if np.isnan(py[1]) else py[1])])
            v = float(predict(x, full)[0]); v = min(max(v, 0.25), 0.75)
            e = out["teams"].setdefault(f, {"now": {"wp": round(float(g.wp[T.LAST]), 3), "w": int(g.W[T.LAST]), "l": int(g.L[T.LAST]), "pyth": round(float(g.pyth[T.LAST]), 3)}, "pred": []})
            e["pred"].append({"h": h, "year": T.LAST + h, "wp": round(v, 3), "lo": round(max(v + q10, 0.2), 3), "hi": round(min(v + q90, 0.8), 3), "wins": round(v * 144), "method": best})
    p = T.ROOT / "public/data/team_forecast.json"; p.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"); print("->", p, f"{p.stat().st_size // 1024}KB")
    print({k: [x["wp"] for x in v["pred"]] for k, v in out["teams"].items()})

if __name__ == "__main__": main()
