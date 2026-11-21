"""추가 분석 7가지: 투구 런 밸류, 부하·휴식·타순 횟수, 매치업 예측, 공 연결·접근각·터널링, 타순·라인업 시뮬레이션, 팀 경기 예측(Elo), 타구 유형·병살·실책.

사용: python3 ml/more.py [원본_폴더]   (pitchlab.py와 같은 원본, 약 10분)
결과: public/data/more.json, ml/more_models.json
모델은 모두 시간 순(학습 ~7월, 검증 8월, 시험 9월 이후) 또는 앞으로 걸으며 검증(walk-forward)으로 비교하고 검증이 가장 좋은 것을 쓴다.
"""
import json, pathlib, sys, warnings
import numpy as np, pandas as pd
warnings.filterwarnings("ignore")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import pitchlab as PL
from pitchlab import ROOT, SRC, R, STAT

TR, VA = "2026-08-01", "2026-09-01"
CLS = ["삼진", "볼넷·사구", "단타", "2루타·3루타", "홈런", "그 외 아웃"]


def split_masks(dates):
    d = pd.Series(np.asarray(dates)); return (d < TR).values, ((d >= TR) & (d < VA)).values, (d >= VA).values


def mse(y, p): return float(np.mean((np.asarray(y) - np.asarray(p)) ** 2))


# ---------------------------------------------------------------------------------------------
# 1. 투구 런 밸류: 공 하나가 그 타석의 기대 득점(타자 기준)을 얼마나 바꿨는가
# ---------------------------------------------------------------------------------------------
def run_values(p, pa):
    import lightgbm as lgb
    from catboost import CatBoostRegressor
    q = p.copy(); q["pa_re"] = q.pa_key.map(pa.set_index("pa_key").re24)
    q = q[q.pa_re.notna()].copy()
    g = q.groupby("pa_key")
    q["nb"] = g.balls.shift(-1); q["ns"] = g.strikes.shift(-1)
    q["term"] = q.nb.isna()
    X = lambda b, s, o, bs: pd.DataFrame({"b": b, "s": s, "o": o, "bs": bs})
    S0 = X(q.balls, q.strikes, q.outs, q.bases); y = q.pa_re.values
    tr, va, te = split_masks(q.game_date)

    class Look:
        def __init__(s, cols, k): s.cols, s.k = cols, k
        def fit(s, X, y):
            d = pd.DataFrame(X[s.cols]).assign(y=np.asarray(y)); s.mu = float(np.mean(y))
            s.t = d.groupby(s.cols).y.agg(["sum", "count"]); return s
        def predict(s, X):
            idx = pd.MultiIndex.from_frame(X[s.cols]) if len(s.cols) > 1 else X[s.cols[0]]
            t = s.t.reindex(idx); return ((t["sum"].fillna(0) + s.k * s.mu) / (t["count"].fillna(0) + s.k)).values
    class G:
        def __init__(s, m): s.m = m
        def fit(s, X, y): s.m.fit(X, y); return s
        def predict(s, X): return s.m.predict(X)
    mk = {
        "볼카운트 평균": lambda: Look(["b", "s"], 1),
        "볼카운트·아웃·주자 평균(보정)": lambda: Look(["b", "s", "o", "bs"], 30),
        "LightGBM": lambda: G(lgb.LGBMRegressor(n_estimators=300, learning_rate=0.05, num_leaves=31, min_child_samples=300, subsample=0.8, subsample_freq=1, reg_lambda=10, verbose=-1)),
        "CatBoost": lambda: G(CatBoostRegressor(iterations=300, depth=6, learning_rate=0.08, l2_leaf_reg=10, verbose=0, random_seed=0)),
    }
    res, pv, pt = {}, {}, {}
    base = float(np.mean(y[tr]))
    res["항상 같은 값(평균)"] = {"val": round(mse(y[va], np.full(va.sum(), base)), 5), "test": round(mse(y[te], np.full(te.sum(), base)), 5)}
    for k, f in mk.items():
        a = f().fit(S0[tr], y[tr]).predict(S0[va]); b = f().fit(S0[tr | va], y[tr | va]).predict(S0[te])
        pv[k], pt[k] = a, b; res[k] = {"val": round(mse(y[va], a), 5), "test": round(mse(y[te], b), 5)}
    best = min(mk, key=lambda k: res[k]["val"])
    mdl = mk[best]().fit(S0, y)
    q["V0"] = mdl.predict(S0)
    S1 = X(q.nb.fillna(0), q.ns.fillna(0), q.outs, q.bases)
    q["V1"] = np.where(q.term, q.pa_re, mdl.predict(S1))
    q["rv"] = q.V1 - q.V0                       # 타자 기준(+는 타자에게 이득)
    return q, res, best


def rv_tables(q):
    """투수: 구종별 투구 가치. 타자: 존 안·밖 × 스윙·지켜봄의 가치(같은 볼카운트 평균 대비)."""
    q = q.copy(); q["cat"] = q.inzone.astype(int) * 2 + q.swing.astype(int)    # 0 존밖 지켜봄 1 존밖 스윙 2 존안 지켜봄 3 존안 스윙
    q["cnt"] = q.balls * 3 + q.strikes
    q["res"] = q.rv - q.groupby(["cat", "cnt"]).rv.transform("mean")
    out_p, out_b = {}, {}
    for (pid, t), g in q.groupby(["pitcher_id", "pitch_type"]):
        if len(g) >= 20: out_p.setdefault(str(pid), {})[t] = [len(g), -float(g.rv.sum())]
    lg_p = {t: [len(g), -float(g.rv.sum())] for t, g in q.groupby("pitch_type") if len(g) >= 200}
    for bid, g in q.groupby("batter_id"):
        out_b[str(bid)] = [[int((g.cat == c).sum()), float(g.res[g.cat == c].sum())] for c in range(4)] + [[len(g), float(g.rv.sum())]]
    lg_b = [[int((q.cat == c).sum()), float(q.rv[q.cat == c].sum())] for c in range(4)]
    return out_p, lg_p, out_b, lg_b



# ---------------------------------------------------------------------------------------------
# 2. 투수 부하·휴식, 같은 타자를 몇 번째 만나는가(TTO), 등판 때 승부처 정도
# ---------------------------------------------------------------------------------------------
RESTB = ["연투(휴식 0~1일)", "휴식 2일", "휴식 3~4일", "휴식 5~6일", "휴식 7일 이상"]


def workload(pa):
    g = pd.read_csv(SRC / "kbo_games/pitching.csv"); g = g[(g.round_code == "kbo_r") & (g.used == 1)].copy()
    g["d"] = np.array(g.game_date.values, dtype="datetime64[D]").astype(int); g = g.sort_values(["pitcher_id", "d"]).reset_index(drop=True)
    g["rest"] = g.groupby("pitcher_id").d.diff()
    gg = []
    for pid, x in g.groupby("pitcher_id"):
        d = x.d.values; pt = x.pitches.values
        p3 = [pt[(d >= di - 3) & (d < di)].sum() for di in d]; p7 = [pt[(d >= di - 7) & (d < di)].sum() for di in d]
        gg.append(pd.DataFrame({"i": x.index, "p3": p3, "p7": p7}))
    g = g.join(pd.concat(gg).set_index("i"))
    g["rb"] = np.digitize(g.rest.fillna(9), [2, 3, 5, 7])       # 0:0~1일 1:2일 2:3~4일 3:5~6일 4:7일+(첫 등판 포함)
    v = g[g.fb_n.fillna(0) >= 5].copy(); v["fbdev"] = v.fb_kmh - v.groupby("pitcher_id").fb_kmh.transform("mean")
    v["month"] = v.game_date.str[5:7].astype(int)
    tr, va, te = split_masks(v.game_date)
    from sklearn.linear_model import Ridge
    import lightgbm as lgb
    F = ["rest", "p3", "p7", "starter", "pitches", "month"]; Xv = v[F].fillna(9); y = v.fbdev.values
    res = {"항상 0(그 투수의 평균 구속)": {"val": round(mse(y[va], 0), 5), "test": round(mse(y[te], 0), 5)}}
    mods = {"선형(휴식·최근 투구 수·선발)": lambda: Ridge(alpha=10.0),
            "LightGBM": lambda: lgb.LGBMRegressor(n_estimators=120, learning_rate=0.05, num_leaves=7, min_child_samples=60, reg_lambda=10, verbose=-1)}
    for k, f in mods.items():
        a = f().fit(Xv[tr], y[tr]).predict(Xv[va]); b = f().fit(Xv[tr | va], y[tr | va]).predict(Xv[te])
        res[k] = {"val": round(mse(y[va], a), 5), "test": round(mse(y[te], b), 5)}
    best = min(res, key=lambda k: res[k]["val"])
    lin = Ridge(alpha=10.0).fit(Xv, y); coef = dict(zip(F, [round(float(c), 4) for c in lin.coef_]))
    # 표: 휴식 구간별
    def agg(x): return [int(len(x)), int(x.outs.sum()), int(x.er.sum()), float(x.fbdev.sum()) if "fbdev" in x else 0.0, int(x.fbdev.notna().sum()) if "fbdev" in x else 0]
    g = g.join(v[["fbdev"]]); g["fbdev"] = g.fbdev
    def rows(x): return [[int(len(z)), int(z.outs.sum()), int(z.er.sum()), float(z.fbdev.sum()), int(z.fbdev.notna().sum())] for _, z in [(b, x[x.rb == b]) for b in range(5)]]
    per = {str(pid): rows(x) for pid, x in g.groupby("pitcher_id") if len(x) >= 5}
    lg = rows(g); lgr = rows(g[g.starter == 0]); lgs = rows(g[g.starter == 1])
    return per, {"all": lg, "rel": lgr, "sp": lgs}, {"models": res, "best": best, "coef": coef, "n": int(len(v))}


def tto(pa):
    d = pa.copy(); d["tto"] = d.groupby(["game_id", "pitcher", "batter"]).cumcount() + 1; d["tto"] = d.tto.clip(upper=3) - 1
    d["first"] = d.groupby(["game_id", "pitcher"]).cumcount() == 0
    arr = d[STAT].values; out = {}
    for pid, idx in d.groupby("pitcher").indices.items():
        t = d.tto.values[idx]; out[str(pid)] = [arr[idx][t == k].sum(0).astype(int).tolist() for k in range(3)]
    lg = [arr[d.tto.values == k].sum(0).astype(int).tolist() for k in range(3)]
    # 선발 한정 리그 값 (그날 첫 타석을 상대한 투수 = 선발)
    st = d.groupby(["game_id", "pitcher"]).first().reset_index(); starter = set(zip(st.game_id[st["first"]], st.pitcher[st["first"]]))
    return out, lg, d


def entry_li(d):
    f = d.groupby(["game_id", "pitcher"]).agg(li=("li", "first"), n=("pa", "sum")).reset_index()
    return {str(pid): [float(x.li.mean()), int(len(x))] for pid, x in f.groupby("pitcher")}, float(f.li.mean())



# ---------------------------------------------------------------------------------------------
# 3. 타자 vs 투수 매치업 예측 (타석 결과 6가지)
# ---------------------------------------------------------------------------------------------
def cls_of(res):
    m = {"삼진": 0, "볼넷": 1, "사구": 1, "고의4구": 1, "1루타": 2, "2루타": 3, "3루타": 3, "홈런": 4}
    return res.map(m).fillna(5).astype(int).values


def ll_multi(y, P):
    P = np.clip(P, 1e-6, 1); P = P / P.sum(1, keepdims=True); return float(-np.mean(np.log(P[np.arange(len(y)), y])))


def counts_by(ids, y, K=6):
    df = pd.DataFrame({"i": ids, "y": y}); c = pd.crosstab(df.i, df.y).reindex(columns=range(K), fill_value=0); return c


def enc(tgt, src, kb, kp):
    """src 타석의 기록으로 tgt 타석마다 타자·투수의 보정 확률(6가지)을 계산한다."""
    lg = np.bincount(src.y.values, minlength=6) / len(src)
    cb, cp = counts_by(src.batter.values, src.y.values), counts_by(src.pitcher.values, src.y.values)
    def prob(c, ids, k):
        t = c.reindex(ids).fillna(0).values; n = t.sum(1, keepdims=True); return (t + k * lg) / (n + k), n[:, 0]
    pb, nb = prob(cb, tgt.batter.values, kb); pp, npp = prob(cp, tgt.pitcher.values, kp)
    return pb, pp, nb, npp, lg


def feats(tgt, src, kb, kp):
    pb, pp, nb, npp, lg = enc(tgt, src, kb, kp)
    return np.c_[pb, pp, nb, npp, (tgt.stance.values == tgt.phand.values).astype(int), tgt.hf.values], (pb, pp, lg)


def oof_feats(df, kb, kp, folds=5, seed=0):
    ug = df.game_id.unique(); rng = np.random.RandomState(seed); f = dict(zip(ug, rng.randint(0, folds, len(ug)))); fo = df.game_id.map(f).values
    X = np.zeros((len(df), 6 + 6 + 4))
    for k in range(folds): X[fo == k] = feats(df[fo == k], df[fo != k], kb, kp)[0]
    return X


def matchup(pa):
    import lightgbm as lgb
    from catboost import CatBoostClassifier
    d = pa[["game_id", "date", "batter", "pitcher", "stance", "phand", "hf", "res"]].copy(); d["y"] = cls_of(d.res)
    d = d[d.phand.notna() & d.stance.isin(["L", "R"])].reset_index(drop=True)
    tr, va, te = [m for m in split_masks(d.date)]
    A, B = d[tr], d[va]; AB = d[tr | va]; C = d[te]

    def log5(pb, pp, lg):
        P = pb * pp / lg; return P / P.sum(1, keepdims=True)
    def gbm(kind):
        if kind == "lgb": return lgb.LGBMClassifier(n_estimators=250, learning_rate=0.03, num_leaves=15, min_child_samples=100, subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=10, verbose=-1)
        return CatBoostClassifier(iterations=300, depth=5, learning_rate=0.05, l2_leaf_reg=10, verbose=0, random_seed=0, loss_function="MultiClass")
    res = {}
    # 보정 강도: 학습→검증으로 고르고 그 값으로 시험
    best_k = {}
    grids = {"타자 기록만(보정)": [(k, 1e9) for k in (30, 60, 120, 240)], "투수 기록만(보정)": [(1e9, k) for k in (60, 150, 400)], "타자×투수 곱(log5)": [(a, b) for a in (60, 120, 240) for b in (150, 400)]}
    for name, grid in grids.items():
        def ev(S, T, kb, kp):
            pb, pp, nb, npp, lg = enc(T, S, kb, kp)
            P = log5(pb, pp, lg) if "log5" in name else pb if name.startswith("타자") else pp; return ll_multi(T.y.values, P)
        sc = [(ev(A, B, *g), g) for g in grid]; bv, bg = min(sc); best_k[name] = bg
        res[name] = {"val": round(bv, 5), "test": round(ev(AB, C, *bg), 5)}
    lg_v = np.bincount(A.y.values, minlength=6) / len(A); lg_t = np.bincount(AB.y.values, minlength=6) / len(AB)
    res = {"리그 평균": {"val": round(ll_multi(B.y.values, np.tile(lg_v, (len(B), 1))), 5), "test": round(ll_multi(C.y.values, np.tile(lg_t, (len(C), 1))), 5)}, **res}
    kb, kp = best_k["타자×투수 곱(log5)"]
    Pv, Pt = {}, {}
    for kind, nm in (("lgb", "LightGBM(두 선수 확률+좌우+홈)"), ("cat", "CatBoost(두 선수 확률+좌우+홈)")):
        Xa = oof_feats(A, kb, kp); Xb = feats(B, A, kb, kp)[0]; m = gbm(kind).fit(Xa, A.y.values); Pv[kind] = m.predict_proba(Xb)
        Xab = oof_feats(AB, kb, kp); Xc = feats(C, AB, kb, kp)[0]; m2 = gbm(kind).fit(Xab, AB.y.values); Pt[kind] = m2.predict_proba(Xc)
        res[nm] = {"val": round(ll_multi(B.y.values, Pv[kind]), 5), "test": round(ll_multi(C.y.values, Pt[kind]), 5)}
    av, at = (Pv["lgb"] + Pv["cat"]) / 2, (Pt["lgb"] + Pt["cat"]) / 2
    res["LightGBM+CatBoost 평균"] = {"val": round(ll_multi(B.y.values, av), 5), "test": round(ll_multi(C.y.values, at), 5)}
    best = min((k for k in res if k != "리그 평균"), key=lambda k: res[k]["val"])
    # 최종 모델: 전체 타석, 선택된 방식
    Xall = oof_feats(d, kb, kp); ms = {k: gbm(k).fit(Xall, d.y.values) for k in ("lgb", "cat")}
    def predict(X, pb, pp, lg):
        if best.startswith("LightGBM+"): return (ms["lgb"].predict_proba(X) + ms["cat"].predict_proba(X)) / 2
        if best.startswith("LightGBM"): return ms["lgb"].predict_proba(X)
        if best.startswith("CatBoost"): return ms["cat"].predict_proba(X)
        if "log5" in best: return log5(pb, pp, lg)
        return pb if best.startswith("타자") else pp
    return d, res, best, (kb, kp), predict


def matchup_profiles(d, kb, kp, predict):
    lg = np.bincount(d.y.values, minlength=6) / len(d)
    cb, cp = counts_by(d.batter.values, d.y.values), counts_by(d.pitcher.values, d.y.values)
    pbs = (cb.values + kb * lg) / (cb.values.sum(1, keepdims=True) + kb); pps = (cp.values + kp * lg) / (cp.values.sum(1, keepdims=True) + kp)
    nbs, nps = cb.values.sum(1), cp.values.sum(1); bid, pid = cb.index.values, cp.index.values
    hand_p = d.groupby("pitcher").phand.agg(lambda s: s.mode().iloc[0]).reindex(pid).values
    # 타자 구분: 상대 투수 손별 최빈 타석 쪽
    def stance_vs(h): return d[d.phand == h].groupby("batter").stance.agg(lambda s: s.mode().iloc[0])
    sb = {h: stance_vs(h).reindex(bid) for h in "LR"}
    bmain = d.groupby("batter").stance.agg(lambda s: s.mode().iloc[0]).reindex(bid)
    obp = lambda P: P[:, 1:5].sum(1); sc = lambda P: P[:, 1:5].sum(1) + P[:, 2] + 2.5 * P[:, 3] + 4 * P[:, 4]
    shareL = float((d.phand == "L").mean())
    def run(pb, pp, nb, npp, same, hf=0.5):
        X = np.c_[pb, pp, nb, npp, same, np.full(len(pb), hf)]; return predict(X, pb, pp, lg)
    out_b, out_p = {}, {}
    # 투수 쪽 가상 상대 그룹
    ok_p = nps >= 150; ok_b = nbs >= 150
    pq = np.where(ok_p)[0]; sp = obp(pps[pq]); lo, hi = np.quantile(sp, 0.25), np.quantile(sp, 0.75)
    groups_p = {"좌투 평균": pq[hand_p[pq] == "L"], "우투 평균": pq[hand_p[pq] == "R"], "상위 25% 투수": pq[sp <= lo], "하위 25% 투수": pq[sp >= hi]}
    bq = np.where(ok_b)[0]; sbq = sc(pbs[bq]); lob, hib = np.quantile(sbq, 0.25), np.quantile(sbq, 0.75)
    groups_b = {"좌타자 평균": bq[bmain.values[bq] == "L"], "우타자 평균": bq[bmain.values[bq] == "R"], "상위 25% 타자": bq[sbq >= hib], "하위 25% 타자": bq[sbq <= lob]}
    mp = {k: (pps[v].mean(0), float(nps[v].mean()), float((hand_p[v] == "L").mean())) for k, v in groups_p.items()}
    mb = {k: (pbs[v].mean(0), float(nbs[v].mean()), float((bmain.values[v] == "L").mean())) for k, v in groups_b.items()}
    n = len(bid)
    for gname, (pv, npv, fl) in mp.items():
        pL = {"좌투 평균": 1.0, "우투 평균": 0.0}.get(gname, shareL)
        for hand, w in (("L", pL), ("R", 1 - pL)):
            if w == 0: continue
            stance = np.where(sb[hand].isna(), bmain, sb[hand]).astype(object)
            P = run(pbs, np.tile(pv, (n, 1)), nbs, np.full(n, npv), (stance == hand).astype(int))
            for j, b in enumerate(bid): out_b.setdefault(str(b), {}).setdefault(gname, np.zeros(6)); out_b[str(b)][gname] += w * P[j]
    m = len(pid)
    for gname, (bv, nbv, fl) in mb.items():
        bL = {"좌타자 평균": 1.0, "우타자 평균": 0.0}.get(gname, fl)
        for st, w in (("L", bL), ("R", 1 - bL)):
            if w == 0: continue
            P = run(np.tile(bv, (m, 1)), pps, np.full(m, nbv), nps, (hand_p == st).astype(int))
            for j, q_ in enumerate(pid): out_p.setdefault(str(q_), {}).setdefault(gname, np.zeros(6)); out_p[str(q_)][gname] += w * P[j]
    cvt = lambda o: {k: {g: [round(float(x), 4) for x in v] for g, v in e.items()} for k, e in o.items()}
    return cvt(out_b), cvt(out_p), [round(float(x), 4) for x in lg]



# ---------------------------------------------------------------------------------------------
# 4. 공 연결(시퀀싱)·수직 접근각(VAA)·터널링
# ---------------------------------------------------------------------------------------------
def seq_prep(p):
    q = p.copy()
    t = q.t_plate
    vz = q.vz0 + q.az * t; vy = q.vy0 + q.ay * t
    q["vaa"] = np.degrees(np.arctan2(vz, -vy))              # 홈플레이트에 들어올 때 공이 내려오는 각도(도, 음수)
    g = q.groupby("pa_key")
    q["prev_pg"] = g.pg.shift(1).fillna(-1).astype(int)
    q["prev_spd"] = g.speed_kmh.shift(1); q["dspd"] = q.speed_kmh - q.prev_spd
    q["prev_in"] = g.inzone.shift(1).fillna(False).astype(int)
    q["prev_whiff"] = g.whiff.shift(1).fillna(False).astype(int)
    q["csw"] = (q.called | q.whiff)
    return q


def seq_model(q):
    import lightgbm as lgb
    d = q[q.fair & q.speed_kmh.notna()].copy(); y = d.csw.astype(int).values
    types = sorted(d.pitch_type.dropna().unique()); d["pt"] = pd.Categorical(d.pitch_type, categories=types).codes
    d["pl"] = (d.phand == "L").astype(int); d["same"] = (d.phand == d.stance).astype(int)
    base = ["speed_kmh", "hmov", "vmov", "relx", "relz", "pt", "pl", "same", "xz", "zz", "balls", "strikes"]
    seq = base + ["prev_pg", "dspd", "prev_in", "prev_whiff"]
    tr, va, te = split_masks(d.game_date); res = {}
    mk = lambda: lgb.LGBMClassifier(n_estimators=250, learning_rate=0.05, num_leaves=31, min_child_samples=200, subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=10, verbose=-1)
    ll = lambda y, p: float(-np.mean(y * np.log(np.clip(p, 1e-4, 1 - 1e-4)) + (1 - y) * np.log(np.clip(1 - p, 1e-4, 1))))
    mu = y[tr].mean(); res["리그 평균"] = {"val": round(ll(y[va], mu), 5), "test": round(ll(y[te], mu), 5)}
    for nm, cols in (("공 하나만 보는 모델(속도·변화·위치·볼카운트)", base), ("공 연결까지 보는 모델(+직전 공의 구종·구속 차·위치·헛스윙)", seq)):
        a = mk().fit(d[cols][tr], y[tr]).predict_proba(d[cols][va])[:, 1]; b = mk().fit(d[cols][tr | va], y[tr | va]).predict_proba(d[cols][te])[:, 1]
        res[nm] = {"val": round(ll(y[va], a), 5), "test": round(ll(y[te], b), 5)}
    ks = list(res)[1:]; best = min(ks, key=lambda k: res[k]["val"])
    return res, best


def seq_tables(q):
    """투수별: 직전 공 묶음 → 다음 공 묶음의 [공, 스윙, 헛스윙, CSW] / 구종별 VAA / 터널링."""
    out_s, out_v, out_t = {}, {}, {}
    a = np.c_[np.ones(len(q)), q.swing, q.whiff, q.csw].astype(int); pv = q.prev_pg.values; pg = q.pg.values
    first = {}
    for pid, idx in q.groupby("pitcher_id").indices.items():
        tab = np.zeros((4, 3, 4), int)         # 직전(없음/직구계/변화구/오프) × 다음 × 4
        np.add.at(tab, (pv[idx] + 1, pg[idx]), a[idx]); dd = q.dspd.values[idx]; m = (pv[idx] == 0) & (pg[idx] == 2) & ~np.isnan(dd)
        out_s[str(pid)] = {"t": tab.reshape(-1).tolist(), "d": [float(dd[m].sum()), int(m.sum())]}
    tabl = np.zeros((4, 3, 4), int); np.add.at(tabl, (pv + 1, pg), a)
    # VAA와 터널링
    qq = q[q.vaa.notna() & q.pitch_type.notna()]
    lg_v = {t: [float(g.vaa.mean()), int(len(g))] for t, g in qq.groupby("pitch_type") if len(g) >= 200}
    tt = 0.2
    qq = qq.assign(xd=qq.x0 + qq.vx0 * tt + 0.5 * qq.ax * tt * tt, zd=qq.z0 + qq.vz0 * tt + 0.5 * qq.az * tt * tt)
    for pid, g in qq.groupby("pitcher_id"):
        c = g.pitch_type.value_counts(); c = c[c >= 30]
        if len(c) == 0: continue
        out_v[str(pid)] = {t: [round(float(x.vaa.mean()), 2), int(len(x))] for t, x in g.groupby("pitch_type") if len(x) >= 30}
        fbs = [t for t in ("직구", "투심") if t in c.index]
        if not fbs: continue
        fb = max(fbs, key=lambda t: c[t]); f = g[g.pitch_type == fb]; row = []
        m0 = lambda x: np.array([x.x0.mean(), x.z0.mean()]); md = lambda x: np.array([x.xd.mean(), x.zd.mean()]); mp = lambda x: np.array([x.plate_x.mean(), x.plate_z.mean()])
        for t in c.index:
            if t == fb: continue
            x = g[g.pitch_type == t]
            row.append([t, int(len(x)), round(float(np.linalg.norm(m0(x) - m0(f)) * 30.48), 1), round(float(np.linalg.norm(md(x) - md(f)) * 12), 1), round(float(np.linalg.norm(mp(x) - mp(f)) * 12), 1)])
        out_t[str(pid)] = {"fb": fb, "rows": row}
    return out_s, tabl.reshape(-1).tolist(), out_v, lg_v, out_t



# ---------------------------------------------------------------------------------------------
# 5. 타순 분석과 라인업 시뮬레이션(마르코프)
# ---------------------------------------------------------------------------------------------
C7 = ["삼진", "볼넷·사구", "단타", "2루타", "3루타", "홈런", "그 외 아웃"]


def cls7(res):
    m = {"삼진": 0, "볼넷": 1, "사구": 1, "고의4구": 1, "1루타": 2, "2루타": 3, "3루타": 4, "홈런": 5}
    return res.map(m).fillna(6).astype(int).values


def transitions(pa):
    d = pa[~pa.last_half].copy(); d["c"] = cls7(d.res)
    no = d.n_outs.fillna(3).astype(int).values; nb = np.where(d.half_end, 0, d.n_bases.fillna(0)).astype(int); rr = d.runs_pa.fillna(0).astype(int).values
    T = {}
    for c, o, b, a, bb, r in zip(d.c.values, d.outs0.values, d.bases0.values, no, nb, rr):
        T.setdefault((c, int(o), int(b)), {}); k = (int(a), int(bb), int(r)); T[(c, int(o), int(b))][k] = T[(c, int(o), int(b))].get(k, 0) + 1
    return {k: [(a, b, r, n / sum(v.values())) for (a, b, r), n in v.items()] for k, v in T.items()}


def lineup_runs(P, T):
    """P: 9×7 타석 결과 확률. 9이닝 기대 득점(첫 타자부터 순환)을 마르코프 계산으로 구한다."""
    S = 24; n = 9 * S; Q = np.zeros((n, n)); r = np.zeros(n); A = np.zeros((n, 9))
    for k in range(9):
        for o in range(3):
            for b in range(8):
                i = k * S + o * 8 + b; nk = (k + 1) % 9
                for c in range(7):
                    pc = P[k, c]
                    for (a, bb, rn, w) in T.get((c, o, b), []):
                        pw = pc * w; r[i] += pw * rn
                        if a >= 3: A[i, nk] += pw
                        else: Q[i, nk * S + a * 8 + bb] += pw
    N = np.linalg.inv(np.eye(n) - Q); E = N @ r; End = N @ A
    ER = np.array([E[k * S] for k in range(9)]); NX = np.array([End[k * S] for k in range(9)])
    v = np.zeros(9); v[0] = 1; tot = 0.0
    for _ in range(9): tot += v @ ER; v = v @ NX
    return float(tot)


def lineup_tables(pa, T, names):
    b = pd.read_csv(SRC / "kbo_games/batting.csv"); b = b[b.round_code == "kbo_r"]
    slot = b.groupby(["game_id", "batter_id"]).bat_order.min()
    d = pa.copy(); d["slot"] = [slot.get((g, x), np.nan) for g, x in zip(d.game_id, d.batter)]
    d["c"] = cls7(d.res)
    lgc = np.bincount(d.c.values, minlength=7) / len(d)
    arr = d[STAT].values; out = {}; lg_slot = {}
    for sl in range(1, 10):
        m = (d.slot == sl).values; lg_slot[sl] = [arr[m].sum(0).astype(int).tolist(), float(np.nansum(d.re24.values[m]))]
    cb = {}
    for pid, idx in d.groupby("batter").indices.items(): cb[pid] = np.bincount(d.c.values[idx], minlength=7)
    res = {}
    for team, g in d.groupby("bat"):
        ag = g[STAT].values; sl_rows = {sl: [ag[(g.slot == sl).values].sum(0).astype(int).tolist(), float(np.nansum(g.re24.values[(g.slot == sl).values]))] for sl in range(1, 10)}
        cnt = g.groupby("batter").pa.sum().sort_values(ascending=False); core = list(cnt.index[:9])
        mslot = g[g.batter.isin(core)].groupby("batter").slot.mean().reindex(core)
        order = list(mslot.sort_values().index)
        def probs(bid, k=80):
            c = cb[bid]; return (c + k * lgc) / (c.sum() + k)
        P = {bid: probs(bid) for bid in core}
        score = lambda od: lineup_runs(np.array([P[x] for x in od]), T)
        obp = lambda x: P[x][1:6].sum(); ops = lambda x: P[x][1:6].sum() + P[x][2] + 2 * P[x][3] + 3 * P[x][4] + 4 * P[x][5]
        cands = {"실제 라인업(평균 타순)": order, "출루 높은 순": sorted(core, key=lambda x: -obp(x)), "출루+장타 높은 순": sorted(core, key=lambda x: -ops(x))}
        sc = {k: score(v) for k, v in cands.items()}
        best_od = max(cands, key=lambda k: sc[k]); cur = list(cands[best_od]); cs = sc[best_od]
        for _ in range(6):
            imp = False
            for i in range(9):
                for j in range(i + 1, 9):
                    t = list(cur); t[i], t[j] = t[j], t[i]; v = score(t)
                    if v > cs + 1e-9: cur, cs, imp = t, v, True
            if not imp: break
        cands["최적(교환 탐색)"] = cur; sc["최적(교환 탐색)"] = cs
        res[team] = {"slots": sl_rows, "lineups": {k: {"order": [names.get(int(x), str(x)) for x in v], "runs": round(sc[k], 3)} for k, v in cands.items()},
                     "players": [[names.get(int(x), str(x)), int(cnt[x]), round(float(obp(x)), 3), round(float(ops(x)), 3)] for x in order]}
    return res, lg_slot

# ---------------------------------------------------------------------------------------------
# 6. 팀 경기 예측(Elo + 선발 투수 + 최근 폼), 앞으로 걸으며 검증
# ---------------------------------------------------------------------------------------------
def games_table():
    b = pd.read_csv(SRC / "kbo_games/batting.csv"); b = b[b.round_code == "kbo_r"]
    t = b.groupby(["game_id", "game_date", "team", "home"]).run.sum().reset_index()
    h = t[t.home == 1].set_index("game_id"); a = t[t.home == 0].set_index("game_id")
    g = h.join(a, lsuffix="_h", rsuffix="_a", how="inner").reset_index().rename(columns={"team_h": "home", "team_a": "away", "run_h": "rh", "run_a": "ra", "game_date_h": "date"})
    g = g[["game_id", "date", "home", "away", "rh", "ra"]].sort_values(["date", "game_id"]).reset_index(drop=True)
    sp = pd.read_csv(SRC / "kbo_games/pitching.csv"); sp = sp[(sp.round_code == "kbo_r") & (sp.starter == 1)]
    sp = sp.groupby(["game_id", "team"]).agg(pid=("pitcher_id", "first"), outs=("outs", "first"), runs=("run", "first")).reset_index()
    return g, sp


def elo_run(g, sp, K, H, scale=400.0):
    elo = {t: 1500.0 for t in set(g.home) | set(g.away)}; rows = []; hist = {}; stat = {}
    spd = {(r.game_id, r.team): (r.pid, r.outs, r.runs) for r in sp.itertuples()}
    last = {t: [] for t in elo}
    lg_ra = (g.ra.sum() + g.rh.sum()) / (2 * len(g)) * 9 / 9      # 팀당 경기당 득점 ≈ 리그 평균 실점
    for r in g.itertuples():
        eh, ea = elo[r.home], elo[r.away]
        def sr(team):
            pid = spd.get((r.game_id, team), (None,))[0]; st = stat.get(pid, [0.0, 0.0]); k = 30.0     # 선발의 지금까지 9이닝당 실점(이닝 30으로 보정)
            return (st[1] + k * lg_ra / 9) / (st[0] / 3 + k) * 9
        fh = np.mean(last[r.home][-10:]) if last[r.home] else 0.5; fa = np.mean(last[r.away][-10:]) if last[r.away] else 0.5
        rows.append((r.game_id, r.date, r.home, r.away, eh, ea, sr(r.home), sr(r.away), fh, fa, int(r.rh > r.ra) if r.rh != r.ra else 0.5))
        p = 1 / (1 + 10 ** (-(eh - ea + H) / scale)); y = 1.0 if r.rh > r.ra else 0.0 if r.rh < r.ra else 0.5
        m = np.log(abs(r.rh - r.ra) + 1) + 1.0
        d = K * m * (y - p); elo[r.home] += d; elo[r.away] -= d
        last[r.home].append(1.0 if y == 1.0 else 0.0 if y == 0.0 else 0.5); last[r.away].append(1.0 if y == 0.0 else 0.0 if y == 1.0 else 0.5)
        for team in (r.home, r.away):
            x = spd.get((r.game_id, team))
            if x:
                st = stat.setdefault(x[0], [0.0, 0.0]); st[0] += x[1]; st[1] += x[2]
        if r.date not in hist or hist.get("_") != r.date: pass
        hist.setdefault(r.date, dict(elo))
    cols = ["game_id", "date", "home", "away", "eh", "ea", "sh", "sa", "fh", "fa", "y"]
    return pd.DataFrame(rows, columns=cols), elo, hist


def game_model(g, sp):
    from sklearn.linear_model import LogisticRegression
    import lightgbm as lgb
    ll = lambda y, p: float(-np.mean(y * np.log(np.clip(p, 1e-4, 1 - 1e-4)) + (1 - y) * np.log(np.clip(1 - p, 1e-4, 1))))
    early = g[g.date < "2026-06-01"]; best = None
    for K in (4, 8, 12, 20):
        for H in (0, 25, 45):
            f, _, _ = elo_run(g, sp, K, H); e = f[(f.date >= "2026-05-01")]; e = e[e.y != 0.5]
            pr = 1 / (1 + 10 ** (-(e.eh - e.ea + H) / 400)); l = ll(e.y.values, pr.values)
            if best is None or l < best[0]: best = (l, K, H)
    _, K, H = best
    f, elo, hist = elo_run(g, sp, K, H); f = f[f.y != 0.5].reset_index(drop=True)
    f["de"] = f.eh - f.ea; f["ds"] = f.sa - f.sh; f["df"] = f.fh - f.fa
    f["pe"] = 1 / (1 + 10 ** (-(f.de + H) / 400))
    ev = f[f.date >= "2026-07-01"].index; months = sorted(set(f.loc[ev, "date"].str[:7]))
    cands = {"홈팀 승률만": None, "Elo만": None, "로지스틱(Elo 차+선발 실점 차+최근 10경기)": None, "LightGBM(같은 입력)": None}
    pred = {k: np.zeros(len(f)) for k in cands}; FE = ["de", "ds", "df"]
    for mo in months:
        te = (f.date.str[:7] == mo).values; trn = (f.date < mo + "-01").values & (f.date >= "2026-05-01").values
        pred["홈팀 승률만"][te] = f.y[trn].mean(); pred["Elo만"][te] = f.pe[te]
        lr = LogisticRegression(C=1.0, max_iter=500).fit(f.loc[trn, FE], f.y[trn]); pred["로지스틱(Elo 차+선발 실점 차+최근 10경기)"][te] = lr.predict_proba(f.loc[te, FE])[:, 1]
        gb = lgb.LGBMClassifier(n_estimators=80, learning_rate=0.03, num_leaves=4, min_child_samples=40, reg_lambda=20, verbose=-1).fit(f.loc[trn, FE], f.y[trn]); pred["LightGBM(같은 입력)"][te] = gb.predict_proba(f.loc[te, FE])[:, 1]
    m = f.index.isin(ev); y = f.y[m].values
    res = {k: {"logloss": round(ll(y, v[m]), 5), "acc": round(float(np.mean((v[m] > 0.5) == (y == 1))), 4)} for k, v in pred.items()}
    res["항상 50%"] = {"logloss": round(ll(y, np.full(len(y), 0.5)), 5), "acc": 0.5}
    best_name = min((k for k in res if k != "항상 50%"), key=lambda k: res[k]["logloss"])
    # 최종: 모든 경기로 학습, 팀 쌍별 홈 승리 확률(선발·폼 차이는 0)
    teams = sorted(elo); lr = LogisticRegression(C=1.0, max_iter=500).fit(f[FE], f.y); gb = lgb.LGBMClassifier(n_estimators=80, learning_rate=0.03, num_leaves=4, min_child_samples=40, reg_lambda=20, verbose=-1).fit(f[FE], f.y)
    def pair(h, a):
        de = elo[h] - elo[a]; x = pd.DataFrame({"de": [de], "ds": [0.0], "df": [0.0]})
        if best_name.startswith("Elo"): return 1 / (1 + 10 ** (-(de + H) / 400))
        if best_name.startswith("로지"): return float(lr.predict_proba(x)[0, 1])
        if best_name.startswith("Light"): return float(gb.predict_proba(x)[0, 1])
        return float(f.y.mean())
    mat = {h: {a: round(pair(h, a), 3) for a in teams if a != h} for h in teams}
    dates = sorted(hist)[::7]; traj = {t: [[dd[5:], round(hist[dd][t], 1)] for dd in dates] for t in teams}
    return {"elo": {t: round(v, 1) for t, v in elo.items()}, "traj": traj, "matrix": mat, "models": res, "best": best_name, "K": K, "H": H, "n_eval": int(m.sum())}

# ---------------------------------------------------------------------------------------------
# 7. 타구 유형·병살·실책
# ---------------------------------------------------------------------------------------------
BIPK = ["땅볼 아웃", "뜬공 아웃", "라인드라이브 아웃", "병살타", "실책 출루", "야수선택", "번트", "희생플라이"]


def bip_tables(pa, p):
    d = pa.copy()
    kinds = {"땅볼": 0, "플라이": 1, "라인드라이브": 2, "병살타": 3, "실책출루": 4, "야수선택": 5, "번트아웃": 6, "희생번트": 6, "희생플라이": 7}
    k = d.res.map(kinds).fillna(-1).astype(int).values
    dpo = (((d.bases0.values & 1) > 0) & (d.outs0.values < 2)).astype(int)
    def tab(col):
        out = {}
        for pid, idx in d.groupby(col).indices.items():
            kk = k[idx]; out[str(pid)] = [[int((kk == j).sum()) for j in range(8)], int(dpo[idx].sum()), int(((kk == 3) & (dpo[idx] > 0)).sum()), int((d.res.values[idx] != "삼진").sum() - ((d.res.values[idx] == "볼넷") | (d.res.values[idx] == "사구") | (d.res.values[idx] == "고의4구")).sum())]
        return out
    lg = [[int((k == j).sum()) for j in range(8)], int(dpo.sum()), int(((k == 3) & (dpo > 0)).sum()), int((d.res.values != "삼진").sum() - d.res.isin(["볼넷", "사구", "고의4구"]).sum())]
    # 팀별 수비 실책: 어느 수비 위치에서 났는가
    last = p[p.pa_last_pitch == 1][["pa_key", "pa_result", "pa_result_text"]]; last = last[last.pa_result == "실책출루"].copy()
    pos = ["투수", "포수", "1루수", "2루수", "3루수", "유격수", "좌익수", "중견수", "우익수"]
    def posof(t):
        import re
        m = re.search(r"\((.*?)\s*(?:포구|송구|실책|파울|플라이)", str(t)); s = m.group(1) if m else ""
        for q in pos:
            if q in s: return q
        for q in pos:
            if q in str(t).split(":")[-1]: return q
        return None
    last["pos"] = last.pa_result_text.map(posof)
    ft = pa.set_index("pa_key").fld; last["fld"] = last.pa_key.map(ft)
    err = {t: [int(((last.fld == t) & (last.pos == q)).sum()) for q in pos] for t in sorted(pa.fld.unique())}
    return tab("batter"), tab("pitcher"), tab("bat"), tab("fld"), lg, err, pos



def main():
    p, pa, fin = PL.load()
    pa = PL.build_states(pa, fin); RE, tab = PL.re_table(pa); pa = PL.add_re24(pa, RE)
    wres, wbest, wpred = PL.wp_models(pa, RE); pa = PL.add_wpa(pa, RE, wpred)
    p = PL.prep_pitches(p)
    bn = {int(k): v for k, v in p.drop_duplicates("batter_id").set_index("batter_id").batter_name.items()}
    out = {"b": {}, "p": {}, "t": {}, "meta": {}}
    B, P_, T_ = out["b"], out["p"], out["t"]; M_ = out["meta"]; models = {}
    print("1 런 밸류"); q, rres, rbest = run_values(p, pa); op, lp, ob, lb = rv_tables(q)
    for k, v in op.items(): P_.setdefault(k, {})["rv"] = v
    for k, v in ob.items(): B.setdefault(k, {})["rv"] = v
    M_["rv"] = {"models": rres, "best": rbest, "lg_p": lp, "lg_b": lb, "pitches": int(len(q))}; models["run_value"] = {"models": rres, "best": rbest}
    print("2 부하·TTO"); per, wl, winfo = workload(pa); tt, ttl, dd = tto(pa); eli, meli = entry_li(dd)
    for k, v in per.items(): P_.setdefault(k, {})["work"] = v
    for k, v in tt.items(): P_.setdefault(k, {})["tto"] = v
    for k, v in eli.items(): P_.setdefault(k, {})["li"] = [round(v[0], 3), v[1]]
    M_["work"] = {**winfo, "lg": wl, "rest": RESTB, "tto_lg": ttl, "entry_li": round(meli, 3)}; models["workload"] = winfo
    print("3 매치업"); d3, mres, mbest, (kb, kp), mpred = matchup(pa); mb, mp, mlg = matchup_profiles(d3, kb, kp, mpred)
    for k, v in mb.items(): B.setdefault(k, {})["mu"] = v
    for k, v in mp.items(): P_.setdefault(k, {})["mu"] = v
    M_["mu"] = {"models": mres, "best": mbest, "kb": kb, "kp": kp, "lg": mlg, "classes": CLS, "n": int(len(d3))}; models["matchup"] = {"models": mres, "best": mbest}
    print("4 시퀀싱"); qs = seq_prep(p); sres, sbest = seq_model(qs); ss, slg, sv, svlg, stn = seq_tables(qs)
    for k, v in ss.items(): P_.setdefault(k, {})["seq"] = v
    for k, v in sv.items(): P_.setdefault(k, {})["vaa"] = v
    for k, v in stn.items(): P_.setdefault(k, {})["tun"] = v
    M_["seq"] = {"models": sres, "best": sbest, "lg": slg, "lg_vaa": svlg}; models["sequence"] = {"models": sres, "best": sbest}
    print("5 타순"); Tr = transitions(pa); lt, lgs = lineup_tables(pa, Tr, bn)
    for k, v in lt.items(): T_.setdefault(k, {})["lineup"] = v
    M_["lineup"] = {"lg_slot": {str(a): b for a, b in lgs.items()}, "c7": C7}
    print("6 경기 예측"); g, sp = games_table(); gm = game_model(g, sp); M_["game"] = gm; models["game"] = {k: gm[k] for k in ("models", "best", "K", "H", "n_eval")}
    for t, e in gm["elo"].items(): T_.setdefault(t, {})["elo"] = e
    print("7 타구 유형"); bb, bp, bt, bf, blg, err, pos = bip_tables(pa, p)
    for k, v in bb.items(): B.setdefault(k, {})["bip"] = v
    for k, v in bp.items(): P_.setdefault(k, {})["bip"] = v
    for t in bt: T_.setdefault(t, {})["bip"] = {"bat": bt[t], "fld": bf.get(t), "err": err.get(t)}
    M_["bip"] = {"lg": blg, "kinds": BIPK, "pos": pos}
    out = R(out, 4)
    json.dump(out, open(ROOT / "public/data/more.json", "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump(models, open(ROOT / "ml/more_models.json", "w"), ensure_ascii=False, indent=1)
    print("more.json", round((ROOT / "public/data/more.json").stat().st_size / 1024), "KB")


if __name__ == "__main__" and "--rv" not in sys.argv:
    main()


if __name__ == "__main__" and "--rv" in sys.argv:
    import time; t = time.time()
    p = pd.read_pickle("/tmp/x/pl_p.pkl"); pa = pd.read_pickle("/tmp/x/pl_pa2.pkl")
    p = PL.prep_pitches(p); q, res, best = run_values(p, pa)
    print(best, res, round(time.time() - t))
    op, lp, ob, lb = rv_tables(q)
    print(sorted(lp.items(), key=lambda kv: -kv[1][1] / kv[1][0])[:3], lb, round(q.rv.sum(), 1), round(q.pa_re.groupby(q.pa_key).first().sum(), 1))
    q[["pa_key", "pitcher_id", "batter_id", "pitch_type", "rv", "game_date", "inzone", "swing"]].to_pickle("/tmp/x/rv.pkl")
