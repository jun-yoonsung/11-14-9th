"""공의 움직임(궤적)·구종 비교(터널링)·다음 공 예측 데이터를 만든다. (public/data/flight.json, traj.json)

실행: python3 ml/flight.py [원본_폴더]   (약 10분)  개발용 캐시: FLIGHT_PKL=/tmp/x/pl_p.pkl

참고: jun-yoonsung/BallCombination 의 궤적·터널링·볼배합 예측 방식을 baseball-lab 데이터에 맞게 다시 구현했다.
- 궤적: PITCHf/x 9-파라미터(위치 = 시작 위치 + 속도·t + 가속도·t²/2). 선수·구종 평균 파라미터와 개별 투구 표본을 저장하고,
  그리기와 터널링 계산(홈 도착 전 같은 시간에 맞춰 비교)은 화면(src/lib/flight.js)에서 한다.
- 다음 공 예측: 구종(12개 카운트 × 타석 좌우 × 직전 구종), 코스(13칸), 헛스윙 확률을 각각 여러 모델로 만들어
  시간 순(학습 8월 이전 / 검증 8월 / 시험 9~10월)으로 비교하고, 검증에서 가장 좋은 모델로 다시 학습해 표로 미리 계산한다.
"""
import json, os, pathlib, sys, warnings
import numpy as np, pandas as pd
warnings.filterwarnings("ignore")
import pitchlab as PL
from pitchlab import ROOT

TR, VA = "2026-08-01", "2026-09-01"
SWING = {"S", "F", "H", "W", "V"}; WHIFF = {"S", "V"}
ZB, ZT, ZW = 1.61, 3.33, 0.83
NZ = 13
ZNAME = ["존 위·3루쪽", "존 위·가운데", "존 위·1루쪽", "존 가운데·3루쪽", "한가운데", "존 가운데·1루쪽", "존 아래·3루쪽", "존 아래·가운데", "존 아래·1루쪽",
         "바깥 위·3루쪽", "바깥 위·1루쪽", "바깥 아래·3루쪽", "바깥 아래·1루쪽"]
FAST = ("직구", "투심")
PARAMS = ["x0", "y0", "z0", "vx0", "vy0", "vz0", "ax", "ay", "az"]
MIN_P = 150


def ll(P, y):
    return float(-np.mean(np.log(np.clip(P[np.arange(len(y)), y], 1e-9, 1))))


def r6(x, n=4): return round(float(x), n)


def day(s):
    return np.array(list(s), dtype="datetime64[D]").astype(int)


# ------------------------------------------------------------------------------ 준비
def prep(p):
    q = p[p.pitch_type.notna() & (p.pitch_type != "너클볼")].copy().reset_index(drop=True)
    types = list(q.pitch_type.value_counts().index)
    q["ti"] = q.pitch_type.map({t: i for i, t in enumerate(types)}).astype(int)
    pids = sorted(q.pitcher_id.unique()); q["pi"] = q.pitcher_id.map({k: i for i, k in enumerate(pids)}).astype(int)
    q["cnt"] = np.minimum(q.balls.astype(int), 3) * 3 + np.minimum(q.strikes.astype(int), 2)
    q["st"] = (q.stance == "L").astype(int)
    q["hand"] = (q.phand == "L").astype(int)
    K = len(types)
    q["prev"] = q.groupby("pa_key").ti.shift(1).fillna(K).astype(int)
    z = q.plate_z.values.astype(float)
    ok = (q.sz_top > q.sz_bot).values
    zn = np.where(ok, ZB + (z - q.sz_bot.values) / np.where(ok, (q.sz_top - q.sz_bot).values, 1) * (ZT - ZB), z)
    x = q.plate_x.values.astype(float)
    inz = (np.abs(x) <= ZW) & (zn >= ZB) & (zn <= ZT)
    col = np.minimum(2, ((x + ZW) / (2 * ZW) * 3).astype(float).clip(0, 3).astype(int)); row = np.minimum(2, ((ZT - zn) / (ZT - ZB) * 3).clip(0, 3).astype(int))
    low = zn < (ZB + ZT) / 2
    zone = np.where(inz, row * 3 + col, 9 + 2 * low.astype(int) + (x > 0).astype(int))
    zone = np.where(np.isnan(x) | np.isnan(zn), -1, zone)
    q["zone"] = zone.astype(int)
    b, s = q.balls.astype(int).values, q.strikes.astype(int).values
    q["cg"] = np.where((b == 0) & (s == 0), 0, np.where(s == 2, 1, np.where(b > s, 2, 3)))
    q["swing"] = q.pitch_result.isin(SWING).values; q["whiff"] = q.pitch_result.isin(WHIFF).values
    q["day"] = day(q.game_date.values)
    q["sp"] = np.where(q.game_date < TR, 0, np.where(q.game_date < VA, 1, 2))
    q["score_d"] = (q.bat_score - q.opp_score).clip(-6, 6)
    return q, types, pids


# ------------------------------------------------------------------------------ 구종 모델
class Hier:
    """계층형 빈도 모델 (투수 → 카운트 → 타석 → 직전 구종), 수축 + 리그 카운트 효과 + 최근 가중. 격자 전체를 한 번에 계산한다."""

    def __init__(self, K, P, hand, alphas=(10, 60, 80, 30), hl=45, ce=300):
        self.K, self.P, self.hand, self.alphas, self.hl, self.ce = K, P, hand, alphas, hl, ce

    def fit(self, d):
        K, P = self.K, self.P
        ref = d.day.max(); w = 0.5 ** ((ref - d.day.values) / self.hl) if self.hl else np.ones(len(d))
        pi, cnt, st, pv, ti = (d[c].values for c in ("pi", "cnt", "st", "prev", "ti"))
        C0 = np.zeros((P, K)); C1 = np.zeros((P, 12, K)); C2 = np.zeros((P, 12, 2, K)); C3 = np.zeros((P, 12, 2, K + 1, K))
        np.add.at(C0, (pi, ti), w); np.add.at(C1, (pi, cnt, ti), w); np.add.at(C2, (pi, cnt, st, ti), w); np.add.at(C3, (pi, cnt, st, pv, ti), w)
        lg = np.bincount(ti, minlength=K) / len(ti)
        fb = np.array([1.0 if t in self.fast else 0.0 for t in range(K)]) if hasattr(self, "fast") else None
        # 리그 카운트 효과: (카운트, 투수 손)별 직구 계열 비율 ÷ 전체 비율
        g = np.zeros((12, 2, 2)); h = d.hand.values; isf = np.isin(ti, self.fastidx).astype(int)
        np.add.at(g, (cnt, h, isf), 1)
        gs = np.array([1 - isf.mean(), isf.mean()])
        eff = ((g + self.ce * gs) / (g.sum(2, keepdims=True) + self.ce)) / gs            # [cnt, hand, group]
        grp = np.array([1 if t in self.fastidx else 0 for t in range(K)])
        self.C = (C0, C1, C2, C3); self.lg = lg; self.eff = eff; self.grp = grp
        return self

    def grid(self):
        """(P, 12, 2, K+1, K) 확률. 직전 구종 인덱스 K = 직전 공 없음(타석 첫 공)."""
        K, P = self.K, self.P; C0, C1, C2, C3 = self.C; a0, a1, a2, a3 = self.alphas
        sm = lambda C, prior, a: (C + a * prior) / (C.sum(-1, keepdims=True) + a)
        p1 = sm(C0, self.lg[None], a0)                                                     # [P,K]
        hd = self.hand[:, None, None]                                                        # [P,1,1]
        e = self.eff[np.arange(12)[None, :, None], hd, self.grp[None, None, :]]                # [P,12,K]
        q = p1[:, None, :] * e; q = q / q.sum(-1, keepdims=True)
        p2 = sm(C1, q, a1)                                                                   # [P,12,K]
        p3 = sm(C2, p2[:, :, None, :], a2)                                                   # [P,12,2,K]
        p4 = sm(C3, p3[:, :, :, None, :], a3)                                                # [P,12,2,K+1,K]
        return p4

    fastidx = ()


def type_models(q, types, pids, P, hand):
    K = len(types); fi = tuple(i for i, t in enumerate(types) if t in FAST)
    tr, va, te = (q[q.sp == 0], q[q.sp == 1], q[q.sp == 2])
    res, preds = {}, {}

    def ev(name, f):
        res[name] = {"val": r6(ll(f(va), va.ti.values)), "test": r6(ll(f(te), te.ti.values)),
                     "acc": r6(np.mean(f(te).argmax(1) == te.ti.values), 4)}

    lg = np.bincount(tr.ti, minlength=K) / len(tr)
    ev("리그 평균", lambda d: np.tile(lg, (len(d), 1)))
    # 투수 평균(수축)
    c0 = np.zeros((P, K)); np.add.at(c0, (tr.pi.values, tr.ti.values), 1)
    pp = (c0 + 10 * lg) / (c0.sum(1, keepdims=True) + 10)
    ev("투수 평균 비율", lambda d: pp[d.pi.values])
    # 투수 + 카운트(수축)
    c1 = np.zeros((P, 12, K)); np.add.at(c1, (tr.pi.values, tr.cnt.values, tr.ti.values), 1)
    p1 = (c1 + 40 * pp[:, None, :]) / (c1.sum(2, keepdims=True) + 40)
    ev("투수 평균 + 카운트", lambda d: p1[d.pi.values, d.cnt.values])
    best_h, best_v = None, 9
    for al in [(10, 60, 80, 30), (10, 30, 40, 15), (20, 100, 150, 60), (5, 30, 30, 10)]:
        for hl in (45, 90, None):
            m = Hier(K, P, hand, al, hl); m.fastidx = fi; m.fit(tr); G = m.grid()
            v = ll(G[va.pi.values, va.cnt.values, va.st.values, va.prev.values], va.ti.values)
            if v < best_v: best_v, best_h = v, (al, hl)
    al, hl = best_h
    m = Hier(K, P, hand, al, hl); m.fastidx = fi; m.fit(tr); G = m.grid()
    ev(f"계층형 빈도(수축·카운트 효과·최근 가중)", lambda d: G[d.pi.values, d.cnt.values, d.st.values, d.prev.values])
    hier_name = "계층형 빈도(수축·카운트 효과·최근 가중)"
    # CatBoost (투수·카운트·타석·직전 구종·투수 손)
    from catboost import CatBoostClassifier
    cat = ["pi", "cnt", "prev"]; F = ["pi", "cnt", "st", "prev", "hand"]
    cb = CatBoostClassifier(loss_function="MultiClass", iterations=500, learning_rate=0.1, depth=6, verbose=False, thread_count=-1, random_seed=0, cat_features=cat)
    cb.fit(tr[F], tr.ti, eval_set=(va[F], va.ti), early_stopping_rounds=40)
    nit = cb.get_best_iteration() + 1
    ev("CatBoost(투수·카운트·타석·직전 구종)", lambda d: cb.predict_proba(d[F]))
    # 상황 전체를 넣은 참고 모델 (격자로 미리 계산할 수 없어 화면에는 쓰지 못함)
    F2 = F + ["outs", "on_1b", "on_2b", "on_3b", "score_d", "inning"]
    cb2 = CatBoostClassifier(loss_function="MultiClass", iterations=500, learning_rate=0.1, depth=6, verbose=False, thread_count=-1, random_seed=0, cat_features=cat)
    cb2.fit(tr[F2], tr.ti, eval_set=(va[F2], va.ti), early_stopping_rounds=40)
    ev("CatBoost + 아웃·주자·점수·이닝 (참고)", lambda d: cb2.predict_proba(d[F2]))
    tab = ["리그 평균", "투수 평균 비율", "투수 평균 + 카운트", hier_name, "CatBoost(투수·카운트·타석·직전 구종)"]
    best = min(tab, key=lambda k: res[k]["val"])
    info = {"models": res, "best": best, "hier": {"alphas": list(al), "half_life": hl}, "cb_iter": int(nit), "note_situ": None}
    if res["CatBoost + 아웃·주자·점수·이닝 (참고)"]["val"] < res[best]["val"] - 0.003:
        info["note_situ"] = "아웃·주자·점수까지 넣으면 조금 더 좋아지지만, 화면에서 그 상황을 고르는 칸이 많아져 표로 미리 계산하는 모델만 사용했습니다."
    # 전체 자료로 다시 학습해 격자 계산
    full = q
    if best == hier_name:
        m = Hier(K, P, hand, al, hl); m.fastidx = fi; m.fit(full); grid = m.grid()
    elif best == "CatBoost(투수·카운트·타석·직전 구종)":
        cb = CatBoostClassifier(loss_function="MultiClass", iterations=nit, learning_rate=0.1, depth=6, verbose=False, thread_count=-1, random_seed=0, cat_features=cat)
        cb.fit(full[F], full.ti)
        ii = np.stack(np.meshgrid(np.arange(P), np.arange(12), np.arange(2), np.arange(K + 1), indexing="ij"), -1).reshape(-1, 4)
        X = pd.DataFrame({"pi": ii[:, 0], "cnt": ii[:, 1], "st": ii[:, 2], "prev": ii[:, 3], "hand": hand[ii[:, 0]]})[F]
        grid = cb.predict_proba(X).reshape(P, 12, 2, K + 1, K)
    elif best == "투수 평균 + 카운트":
        c1 = np.zeros((P, 12, K)); np.add.at(c1, (full.pi.values, full.cnt.values, full.ti.values), 1)
        c0 = np.zeros((P, K)); np.add.at(c0, (full.pi.values, full.ti.values), 1); lg2 = np.bincount(full.ti, minlength=K) / len(full)
        pp2 = (c0 + 10 * lg2) / (c0.sum(1, keepdims=True) + 10); p1_ = (c1 + 40 * pp2[:, None, :]) / (c1.sum(2, keepdims=True) + 40)
        grid = np.broadcast_to(p1_[:, :, None, None, :], (P, 12, 2, K + 1, K)).copy()
    else:
        c0 = np.zeros((P, K)); np.add.at(c0, (full.pi.values, full.ti.values), 1); lg2 = np.bincount(full.ti, minlength=K) / len(full)
        pp2 = (c0 + 10 * lg2) / (c0.sum(1, keepdims=True) + 10)
        grid = np.broadcast_to(pp2[:, None, None, None, :], (P, 12, 2, K + 1, K)).copy()
    return info, grid


# ------------------------------------------------------------------------------ 코스 모델
def zone_models(q, types, P, hand, ngrid_types):
    K = len(types); z = q[q.zone >= 0]
    tr, va, te = z[z.sp == 0], z[z.sp == 1], z[z.sp == 2]
    res = {}

    def tables(d, a1=5, a2=20, ap=150):
        L = np.bincount(d.zone, minlength=NZ) / len(d)
        c1 = np.zeros((K, 2, 2, NZ)); np.add.at(c1, (d.ti.values, d.hand.values, d.st.values, d.zone.values), 1)
        c2 = np.zeros((K, 2, 2, 4, NZ)); np.add.at(c2, (d.ti.values, d.hand.values, d.st.values, d.cg.values, d.zone.values), 1)
        cp = np.zeros((P, K, 2, NZ)); np.add.at(cp, (d.pi.values, d.ti.values, d.st.values, d.zone.values), 1)
        sm = lambda C, pr, a: (C + a * pr) / (C.sum(-1, keepdims=True) + a)
        l1 = sm(c1, L, a1); l2 = sm(c2, l1[:, :, :, None, :], a2)
        return L, l1, l2, cp

    def predict(T, d, personal, ap=150):
        L, l1, l2, cp = T
        h, t, s, g, p = d.hand.values, d.ti.values, d.st.values, d.cg.values, d.pi.values
        a = l2[t, h, s, g]
        if not personal: return a
        base = l1[t, h, s]; c = cp[p, t, s]
        pp = (c + ap * base) / (c.sum(-1, keepdims=True) + ap)
        out = pp * a / base
        return out / out.sum(-1, keepdims=True)

    def ev(name, f):
        res[name] = {"val": r6(ll(f(va), va.zone.values)), "test": r6(ll(f(te), te.zone.values))}

    res["칸 균등"] = {"val": r6(np.log(NZ)), "test": r6(np.log(NZ))}
    T = tables(tr)
    ev("리그 평균", lambda d: np.tile(T[0], (len(d), 1)))
    ev("리그: 구종·투수 손·타석", lambda d: T[1][d.ti.values, d.hand.values, d.st.values])
    ev("리그: + 카운트 상황", lambda d: predict(T, d, False))
    best_ap, bv = 150, 9
    for ap in (50, 150, 400):
        v = ll(predict(T, va, True, ap), va.zone.values)
        if v < bv: bv, best_ap = v, ap
    name_h = "리그 + 투수 개인 경향(수축)"
    ev(name_h, lambda d: predict(T, d, True, best_ap))
    from catboost import CatBoostClassifier
    F = ["pi", "ti", "st", "hand", "cnt", "prev"]
    cb = CatBoostClassifier(loss_function="MultiClass", iterations=400, learning_rate=0.1, depth=6, verbose=False, thread_count=-1, random_seed=0, cat_features=["pi", "ti", "cnt", "prev"])
    cb.fit(tr[F], tr.zone, eval_set=(va[F], va.zone), early_stopping_rounds=40)
    nit = cb.get_best_iteration() + 1
    nm_c = "CatBoost(투수·구종·카운트·타석·직전 구종)"
    ev(nm_c, lambda d: cb.predict_proba(d[F]))
    cands = ["리그: + 카운트 상황", name_h, nm_c]
    best = min(cands, key=lambda k: res[k]["val"])
    # 격자: [P, K, 2(st), 4(cg), NZ]
    cg_cnt = {g: [c for c in range(12) if _cg_of(c) == g] for g in range(4)}
    cw = np.bincount(z.cnt.values, minlength=12).astype(float)
    full = z
    if best == nm_c:
        cb = CatBoostClassifier(loss_function="MultiClass", iterations=nit, learning_rate=0.1, depth=6, verbose=False, thread_count=-1, random_seed=0, cat_features=["pi", "ti", "cnt", "prev"])
        cb.fit(full[F], full.zone)
        ii = np.stack(np.meshgrid(np.arange(P), np.arange(K), np.arange(2), np.arange(12), indexing="ij"), -1).reshape(-1, 4)
        keep = ngrid_types[ii[:, 0], ii[:, 1]]
        ii = ii[keep]
        X = pd.DataFrame({"pi": ii[:, 0], "ti": ii[:, 1], "st": ii[:, 2], "cnt": ii[:, 3], "hand": hand[ii[:, 0]], "prev": K})[F]
        pr = cb.predict_proba(X)
        big = np.zeros((P, K, 2, 12, NZ)); big[ii[:, 0], ii[:, 1], ii[:, 2], ii[:, 3]] = pr
        grid = np.zeros((P, K, 2, 4, NZ))
        for g in range(4):
            w = cw[cg_cnt[g]] / cw[cg_cnt[g]].sum()
            grid[:, :, :, g] = np.tensordot(big[:, :, :, cg_cnt[g]], w, axes=([3], [0]))
    else:
        T = tables(full)
        grid = np.zeros((P, K, 2, 4, NZ))
        for hh in (0, 1):
            ps = np.where(hand == hh)[0]
            if not len(ps): continue
            ii = np.stack(np.meshgrid(ps, np.arange(K), np.arange(2), np.arange(4), indexing="ij"), -1).reshape(-1, 4)
            d = pd.DataFrame({"pi": ii[:, 0], "ti": ii[:, 1], "st": ii[:, 2], "cg": ii[:, 3], "hand": hh})
            pr = predict(T, d, best == name_h, best_ap)
            grid[ii[:, 0], ii[:, 1], ii[:, 2], ii[:, 3]] = pr
    return {"models": res, "best": best, "ap": best_ap}, grid


def _cg_of(c):
    b, s = c // 3, c % 3
    return 0 if (b == 0 and s == 0) else (1 if s == 2 else (2 if b > s else 3))


# ------------------------------------------------------------------------------ 헛스윙 모델
def whiff_models(q, types, P, hand, zgrid, ngrid_types):
    K = len(types); s = q[q.swing & (q.zone >= 0)]
    tr, va, te = s[s.sp == 0], s[s.sp == 1], s[s.sp == 2]
    from sklearn.metrics import roc_auc_score
    res = {}

    def ev(name, f):
        pv, pt = np.clip(f(va), 1e-6, 1 - 1e-6), np.clip(f(te), 1e-6, 1 - 1e-6)
        yv, yt = va.whiff.values.astype(int), te.whiff.values.astype(int)
        lo = lambda p, y: float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))
        res[name] = {"val": r6(lo(pv, yv)), "test": r6(lo(pt, yt)), "auc": r6(roc_auc_score(yt, pt), 3)}

    ev("리그 평균", lambda d: np.full(len(d), tr.whiff.mean()))
    # 투수 평소 헛스윙률(수축)
    c = np.zeros((P, 2)); np.add.at(c, (tr.pi.values, tr.whiff.values.astype(int)), 1)
    rate = tr.whiff.mean(); pr = (c[:, 1] + 80 * rate) / (c.sum(1) + 80)
    ev("투수 평소 헛스윙률", lambda d: pr[d.pi.values])

    def onehot(d):
        X = np.zeros((len(d), K + NZ + 4 + 1))
        X[np.arange(len(d)), d.ti.values] = 1; X[np.arange(len(d)), K + d.zone.values] = 1; X[np.arange(len(d)), K + NZ + d.cg.values] = 1
        X[:, -1] = (d.hand.values != d.st.values)
        return X
    from sklearn.linear_model import LogisticRegression
    best_C, bv = 1, 9
    for C in (0.1, 0.5, 2):
        lr = LogisticRegression(C=C, max_iter=500).fit(onehot(tr), tr.whiff.astype(int))
        pv = np.clip(lr.predict_proba(onehot(va))[:, 1], 1e-6, 1 - 1e-6); yv = va.whiff.values.astype(int)
        v = float(-np.mean(yv * np.log(pv) + (1 - yv) * np.log(1 - pv)))
        if v < bv: bv, best_C = v, C
    lr = LogisticRegression(C=best_C, max_iter=500).fit(onehot(tr), tr.whiff.astype(int))
    ev("로지스틱(구종·코스·카운트 구간·맞대결)", lambda d: lr.predict_proba(onehot(d))[:, 1])
    # 로지스틱 + 투수·구종 보정
    def corr_tab(model, d, beta=80):
        pe = model.predict_proba(onehot(d))[:, 1]
        o, e, n = np.zeros((P, K)), np.zeros((P, K)), np.zeros((P, K))
        np.add.at(o, (d.pi.values, d.ti.values), d.whiff.values.astype(float)); np.add.at(e, (d.pi.values, d.ti.values), pe); np.add.at(n, (d.pi.values, d.ti.values), 1)
        rt = np.where(n > 0, e / np.maximum(n, 1), 0)
        return np.where(e > 1e-9, (o + beta * rt) / (e + beta * rt), 1.0)
    CT = corr_tab(lr, tr)
    def corr_pred(d, model=lr, CT=CT):
        p = model.predict_proba(onehot(d))[:, 1]; odds = p / (1 - p) * CT[d.pi.values, d.ti.values]
        return odds / (1 + odds)
    name_lr = "로지스틱 + 투수·구종 보정"
    ev(name_lr, corr_pred)
    from catboost import CatBoostClassifier
    F = ["pi", "ti", "zone", "cnt", "st", "hand"]
    cb = CatBoostClassifier(loss_function="Logloss", iterations=600, learning_rate=0.08, depth=6, verbose=False, thread_count=-1, random_seed=0, cat_features=["pi", "ti", "zone", "cnt"])
    cb.fit(tr[F], tr.whiff.astype(int), eval_set=(va[F], va.whiff.astype(int)), early_stopping_rounds=50)
    nit = cb.get_best_iteration() + 1
    nm_c = "CatBoost(투수·구종·코스·카운트·타석)"
    ev(nm_c, lambda d: cb.predict_proba(d[F])[:, 1])
    cands = ["투수 평소 헛스윙률", "로지스틱(구종·코스·카운트 구간·맞대결)", name_lr, nm_c]
    best = min(cands, key=lambda k: res[k]["val"])
    # 전체로 다시 학습 후 격자 [P,K,2,4] 기대 헛스윙 (코스 예측으로 가중)
    full = s
    cw = np.bincount(full.cnt.values, minlength=12).astype(float)
    cg_cnt = {g: [c for c in range(12) if _cg_of(c) == g] for g in range(4)}
    out = np.zeros((P, K, 2, 4))
    ii = np.stack(np.meshgrid(np.arange(P), np.arange(K), np.arange(2), np.arange(4), np.arange(NZ), indexing="ij"), -1).reshape(-1, 5)
    ii = ii[ngrid_types[ii[:, 0], ii[:, 1]]]
    if best == nm_c:
        cbf = CatBoostClassifier(loss_function="Logloss", iterations=nit, learning_rate=0.08, depth=6, verbose=False, thread_count=-1, random_seed=0, cat_features=["pi", "ti", "zone", "cnt"])
        cbf.fit(full[F], full.whiff.astype(int))
        W = np.zeros((P, K, 2, 4, NZ))
        for g in range(4):
            acc = 0
            for c_ in cg_cnt[g]:
                m = ii[ii[:, 3] == g]
                X = pd.DataFrame({"pi": m[:, 0], "ti": m[:, 1], "zone": m[:, 4], "cnt": c_, "st": m[:, 2], "hand": hand[m[:, 0]]})[F]
                W[m[:, 0], m[:, 1], m[:, 2], g, m[:, 4]] += cbf.predict_proba(X)[:, 1] * cw[c_] / cw[cg_cnt[g]].sum()
    else:
        lrf = LogisticRegression(C=best_C, max_iter=500).fit(onehot(full), full.whiff.astype(int))
        CTf = corr_tab(lrf, full) if best == name_lr else np.ones((P, K))
        if best == "투수 평소 헛스윙률":
            c2 = np.zeros((P, 2)); np.add.at(c2, (full.pi.values, full.whiff.values.astype(int)), 1); pr2 = (c2[:, 1] + 80 * full.whiff.mean()) / (c2.sum(1) + 80)
        d = pd.DataFrame({"pi": ii[:, 0], "ti": ii[:, 1], "st": ii[:, 2], "cg": ii[:, 3], "zone": ii[:, 4], "hand": hand[ii[:, 0]]})
        if best == "투수 평소 헛스윙률":
            pw = pr2[d.pi.values]
        else:
            pw = lrf.predict_proba(onehot(d))[:, 1]; odds = pw / (1 - pw) * CTf[d.pi.values, d.ti.values]; pw = odds / (1 + odds)
        W = np.zeros((P, K, 2, 4, NZ)); W[ii[:, 0], ii[:, 1], ii[:, 2], ii[:, 3], ii[:, 4]] = pw
    out = (zgrid * W).sum(-1)
    return {"models": res, "best": best, "C": best_C}, out


# ------------------------------------------------------------------------------ 궤적
def traj_tables(q, types, pids, keep):
    t = q.dropna(subset=PARAMS).copy()
    lg = {str(i): [int((t.ti == i).sum())] + [r6(t.loc[t.ti == i, c].mean(), 4) for c in PARAMS] for i in range(len(types))}
    mean, each = {}, {}
    rng = np.random.default_rng(0)
    for pi_, g in t.groupby("pi"):
        if pi_ not in keep: continue
        m = {}
        for ti, h in g.groupby("ti"):
            if len(h) >= 8: m[str(ti)] = [int(len(h))] + [r6(h[c].mean(), 4) for c in PARAMS]
        if not m: continue
        ok = g[g.ti.astype(str).isin(m)]
        # 구종별 표본: 비율대로 총 36개 (구종당 최소 3개)
        rows = []
        for ti, h in ok.groupby("ti"):
            k = max(3, int(round(36 * len(h) / len(ok)))); k = min(k, len(h))
            idx = rng.choice(len(h), k, replace=False)
            for r in h.iloc[idx][PARAMS].values: rows.append([int(ti)] + [r6(v, 3) for v in r])
        mean[str(pids[pi_])] = {"m": m, "e": rows}
    return lg, mean


def stage(name, fn):
    """개발 중 실패해도 앞 단계를 다시 돌리지 않도록 결과를 임시 폴더에 저장한다 (FLIGHT_CACHE=폴더)."""
    import pickle
    d = os.environ.get("FLIGHT_CACHE")
    if d:
        f = pathlib.Path(d) / f"flight_{name}.pkl"
        if f.exists(): return pickle.load(open(f, "rb"))
    r = fn()
    if d: pickle.dump(r, open(pathlib.Path(d) / f"flight_{name}.pkl", "wb"))
    return r


def main():
    pk = os.environ.get("FLIGHT_PKL")
    p = pd.read_pickle(pk) if pk else PL.load()[0]
    q, types, pids = prep(p); K = len(types); P = len(pids)
    print("공", len(q), "투수", P, "구종", types)
    hand = q.groupby("pi").hand.agg(lambda s: int(s.mean() > 0.5)).reindex(range(P)).fillna(0).astype(int).values
    cnt_p = q.groupby(["pi", "ti"]).size().unstack(fill_value=0).reindex(index=range(P), columns=range(K), fill_value=0).values
    tot = cnt_p.sum(1, keepdims=True)
    thrown = (cnt_p >= 20) & (cnt_p >= 0.02 * tot)                                # 격자에서 계산할 (투수, 구종)
    keepP = {i for i in range(P) if tot[i, 0] >= MIN_P and thrown[i].any()}
    print("1 구종 모델 비교"); tinfo, tgrid = stage("type", lambda: type_models(q, types, pids, P, hand))
    for k, v in tinfo["models"].items(): print("  ", k, v)
    print("2 코스 모델 비교"); zinfo, zgrid = stage("zone", lambda: zone_models(q, types, P, hand, thrown))
    for k, v in zinfo["models"].items(): print("  ", k, v)
    print("3 헛스윙 모델 비교"); winfo, wgrid = stage("whiff", lambda: whiff_models(q, types, P, hand, zgrid, thrown))
    for k, v in winfo["models"].items(): print("  ", k, v)
    print("4 궤적"); lg, tm = traj_tables(q, types, pids, keepP)
    # 내보내기
    out = {}
    evid = np.zeros((P, 12, 2), int); np.add.at(evid, (q.pi.values, q.cnt.values, q.st.values), 1)
    for i in sorted(keepP):
        ty = [int(t) for t in np.where(thrown[i])[0]]; ty.sort(key=lambda t: -cnt_p[i, t])
        k = len(ty)
        tp = []
        for c in range(12):
            for s in range(2):
                for pv in ty + [K]:
                    pr = tgrid[i, c, s, pv, ty]; pr = pr / pr.sum()
                    tp.extend(int(round(v * 1000)) for v in pr)
        zn = [[[int(round(v * 1000)) for v in (zgrid[i, t, s, g] / max(zgrid[i, t, s, g].sum(), 1e-9))] for g in range(4)] for t in ty for s in range(2)]
        wh = [int(round(wgrid[i, t, s, g] * 1000)) for t in ty for s in range(2) for g in range(4)]
        out[str(pids[i])] = {"ty": ty, "n": [int(cnt_p[i, t]) for t in ty], "hand": int(hand[i]), "tp": tp, "zn": zn, "wh": wh, "ev": evid[i].reshape(-1).tolist()}
    meta = {"types": types, "zone": ZNAME, "zb": [ZB, ZT, ZW], "type": tinfo, "zone_model": zinfo, "whiff": winfo,
            "split": {"train": f"~{TR} 전", "val": f"{TR}~{VA} 전", "test": f"{VA}~"}, "min_pitches": MIN_P,
            "n": {"pitches": int(len(q)), "pitchers": len(out)}}
    d = ROOT / "public/data"
    (d / "flight.json").write_text(json.dumps({"meta": meta, "p": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (d / "traj.json").write_text(json.dumps({"lg": lg, "p": tm}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (ROOT / "ml/flight_models.json").write_text(json.dumps({"type": tinfo, "zone": zinfo, "whiff": winfo}, ensure_ascii=False, indent=1), encoding="utf-8")
    for f in ("flight.json", "traj.json"): print(f, round((d / f).stat().st_size / 1024), "KB")


if __name__ == "__main__":
    main()
