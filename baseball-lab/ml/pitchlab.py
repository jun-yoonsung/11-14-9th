"""투구 분석(존·구종 무브먼트·구위), 볼카운트·상황·득점 기여(RE24)·승리 확률(WPA), 투수 피로·최근 폼.

사용: python3 ml/pitchlab.py [원본_폴더]   (기본 ~/Downloads/kbo_2026_data, kbo_pitches/*.csv + kbo_games/*.csv 필요)
결과: public/data/pitchlab.json, situ.json, form.json, ml/pitchlab_models.json

모델은 모두 시간 순으로 나눠(학습 ~7월, 검증 8월, 시험 9월 이후) 후보를 비교하고 검증이 가장 좋은 것을 쓴다.
 - 승리 확률: 표 조회 / 로지스틱 / LightGBM / CatBoost / 평균
 - 구위: 구종 평균 / 기계학습(물리 값만) / 기계학습(+공 위치·볼카운트)
 - 최근 폼: 리그 평균 / 시즌 누적(보정) / 최근 15경기(보정) / 둘의 섞기
"""
import glob, json, pathlib, sys, warnings
import numpy as np, pandas as pd
warnings.filterwarnings("ignore")

SRC = pathlib.Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else pathlib.Path("~/Downloads/kbo_2026_data").expanduser()
ROOT = pathlib.Path(__file__).resolve().parent.parent
HALF = {"top": 0, "bottom": 1}
HITS = {"1루타": 1, "2루타": 2, "3루타": 3, "홈런": 4}
PG = {"직구": 0, "투심": 0, "커터": 0, "슬라이더": 1, "스위퍼": 1, "커브": 1, "너클볼": 1, "체인지업": 2, "포크": 2}
PGN = ["직구계", "변화구", "오프스피드"]
STAT = ["pa", "ab", "h", "b2", "b3", "hr", "bb", "hbp", "so", "sf"]
SWING = {"S", "F", "H"}


def stat_row(res):
    h = {"1루타": (1, 0, 0, 0), "2루타": (1, 1, 0, 0), "3루타": (1, 0, 1, 0), "홈런": (1, 0, 0, 1)}.get(res)
    if h: return [1, 1, *h, 0, 0, 0, 0]
    if res in ("볼넷", "고의4구"): return [1, 0, 0, 0, 0, 0, 1, 0, 0, 0]
    if res == "사구": return [1, 0, 0, 0, 0, 0, 0, 1, 0, 0]
    if res == "삼진": return [1, 1, 0, 0, 0, 0, 0, 0, 1, 0]
    if res == "희생플라이": return [1, 0, 0, 0, 0, 0, 0, 0, 0, 1]
    if res == "희생번트": return [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    return [1, 1, 0, 0, 0, 0, 0, 0, 0, 0]


def hands(p):
    f = ROOT / "ml/raw/kbo_pitching_stats_season_1982-2026.csv"
    if not f.exists(): f = pathlib.Path("~/Downloads/archive (1)/kbo_pitching_stats_season_1982-2026.csv").expanduser()
    out = {}
    if f.exists():
        k = pd.read_csv(f, usecols=["Id", "BatThrow", "Season"]).dropna(); k = k[k.Season == 2026].drop_duplicates("Id")
        out = {int(i): t[-1] for i, t in zip(k.Id, k.BatThrow) if t[-1] in "LR"}
    for pid, v in p.groupby("pitcher_id").x0.median().items(): out.setdefault(int(pid), "L" if v > 0 else "R")
    return out


def load():
    """공 단위 표(p), 타석 단위 표(pa), 경기 결과(games)를 만든다."""
    p = pd.concat(pd.read_csv(f, encoding="utf-8-sig") for f in sorted(glob.glob(str(SRC / "kbo_pitches/*.csv"))))
    p = p[p.round_code == "kbo_r"].copy()
    p["hf"] = p.half.map(HALF)
    p = p.sort_values(["game_id", "inning", "hf", "seqno", "pitch_num"], kind="stable").reset_index(drop=True)
    p["phand"] = p.pitcher_id.map(hands(p))
    p["pa_id"] = p.groupby("game_id").pitch_num.transform(lambda s: (s == 1).cumsum())
    p["pa_key"] = p.game_id + "_" + p.pa_id.astype(str)
    p["bat_team"] = np.where(p.hf == 0, p.away_team, p.home_team); p["fld_team"] = np.where(p.hf == 0, p.home_team, p.away_team)
    p["bat_score"] = np.where(p.hf == 0, p.away_score, p.home_score); p["opp_score"] = np.where(p.hf == 0, p.home_score, p.away_score)
    p["bases"] = p.on_1b + 2 * p.on_2b + 4 * p.on_3b
    p["xz"] = p.plate_x / 0.708
    p["zz"] = (p.plate_z - p.sz_bot) / (p.sz_top - p.sz_bot)
    p["cell"] = np.digitize(p.zz, [0, 1 / 3, 2 / 3, 1]) * 5 + np.digitize(p.xz, [-1, -1 / 3, 1 / 3, 1])   # 아래→위 5행 × 왼→오(포수 시점) 5열
    p["inzone"] = (p.xz.abs() <= 1) & (p.zz >= 0) & (p.zz <= 1)
    p["pg"] = p.pitch_type.map(PG).fillna(1).astype(int)
    p["pgame"] = p.groupby(["game_id", "pitcher_id"]).cumcount() + 1          # 그 경기에서 몇 번째 공인가
    # 타석 표
    first = p.groupby("pa_key").first(); last = p.groupby("pa_key").last()
    pa = pd.DataFrame({"game_id": first.game_id, "date": first.game_date, "inning": first.inning, "hf": first.hf, "batter": first.batter_id, "pitcher": last.pitcher_id,
                       "stance": first.stance, "phand": last.phand, "bat": first.bat_team, "fld": first.fld_team, "outs0": first.outs, "bases0": first.bases,
                       "bs0": first.bat_score, "os0": first.opp_score, "res": last.pa_result, "b_end": last.balls, "s_end": last.strikes, "pitches": last.pitch_num})
    pa = pa.reset_index().sort_values(["game_id", "inning", "hf", "pa_key"], key=lambda s: s if s.name != "pa_key" else s.str.rsplit("_", n=1).str[1].astype(int), kind="stable").reset_index(drop=True)
    st = pd.DataFrame([stat_row(r) for r in pa.res], columns=STAT)
    pa = pd.concat([pa, st], axis=1)
    # 경기 결과(최종 점수)
    b = pd.read_csv(SRC / "kbo_games/batting.csv"); b = b[b.round_code == "kbo_r"]
    fin = b.groupby(["game_id", "team"]).run.sum().rename("runs").reset_index()
    return p, pa, fin



# ---------------------------------------------------------------------------------------------
# 득점 기대(RE24)와 승리 확률(WPA)
# ---------------------------------------------------------------------------------------------
def build_states(pa, fin):
    """타석마다 '타석 시작 상태'와 '다음 상태'를 붙이고 RE24 계산에 필요한 값을 만든다."""
    pa = pa.copy()
    pa["hk"] = pa.game_id + "_" + pa.inning.astype(str) + "_" + pa.hf.astype(str)
    runs = fin.set_index(["game_id", "team"]).runs
    pa["bat_final"] = [runs.get((g, t), np.nan) for g, t in zip(pa.game_id, pa.bat)]
    pa["opp_final"] = [runs.get((g, t), np.nan) for g, t in zip(pa.game_id, pa.fld)]
    pa["won"] = np.where(pa.bat_final > pa.opp_final, 1.0, np.where(pa.bat_final < pa.opp_final, 0.0, 0.5))
    pa["diff0"] = pa.bs0 - pa.os0
    # 반 이닝 끝 점수: 다음 반 이닝 첫 타석에서 (상대 팀 입장의) 점수를 읽는다. 마지막 반 이닝은 최종 점수
    hk_first = pa.groupby("hk", sort=False).agg(game_id=("game_id", "first"), os0=("os0", "first"), bat_final=("bat_final", "first"))
    hk_first["next_os0"] = hk_first.groupby("game_id").os0.shift(-1)       # 다음 반 이닝 시작 때 (그 팀 상대=지금 공격 팀)의 점수
    hk_first["last_half"] = hk_first.next_os0.isna()
    hk_first["end_bs"] = hk_first.next_os0.fillna(hk_first.bat_final)
    pa = pa.join(hk_first[["end_bs", "last_half"]], on="hk")
    same = pa.groupby("hk", sort=False)
    pa["n_outs"] = same.outs0.shift(-1); pa["n_bases"] = same.bases0.shift(-1); pa["n_bs"] = same.bs0.shift(-1)
    pa["half_end"] = pa.n_outs.isna()
    pa["runs_pa"] = np.where(pa.half_end, pa.end_bs, pa.n_bs) - pa.bs0
    pa["rest"] = pa.end_bs - pa.bs0
    return pa


def re_table(pa):
    ok = pa[~pa.last_half & ~((pa.hf == 1) & (pa.inning >= 9))]
    t = ok.groupby(["outs0", "bases0"]).rest.agg(["mean", "count"])
    return {(int(o), int(b)): float(v) for (o, b), v in t["mean"].items()}, t


def add_re24(pa, RE):
    re0 = np.array([RE.get((int(o), int(b)), np.nan) for o, b in zip(pa.outs0, pa.bases0)])
    re1 = np.where(pa.half_end, 0.0, np.array([RE.get((int(o), int(b)), np.nan) if o == o else np.nan for o, b in zip(pa.n_outs, pa.n_bases)]))
    pa["re0"] = re0
    pa["re24"] = np.where(pa.last_half, np.nan, re1 - re0 + pa.runs_pa)
    return pa


WP_FEATS = ["inning", "home", "outs", "bases", "diff", "re"]


def wp_X(pa, RE, outs="outs0", bases="bases0", diff="diff0", home="hf", inning="inning"):
    re = np.array([RE.get((int(o), int(b)), 0.5) for o, b in zip(pa[outs], pa[bases])])
    return pd.DataFrame({"inning": pa[inning].clip(upper=12).values, "home": pa[home].values, "outs": pa[outs].values, "bases": pa[bases].values, "diff": pa[diff].values, "re": re})


def ll(y, p):
    p = np.clip(p, 1e-4, 1 - 1e-4); return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def wp_models(pa, RE):
    """승리 확률 모델 비교. 같은 경기 타석끼리 묶어 시간 순으로 나눈다."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    import lightgbm as lgb
    from catboost import CatBoostClassifier
    d = pa[pa.won != 0.5].copy(); y = d.won.values
    tr = (d.date < "2026-08-01").values; va = ((d.date >= "2026-08-01") & (d.date < "2026-09-01")).values; te = (d.date >= "2026-09-01").values
    X = wp_X(d, RE)

    def design(X):    # 로지스틱용 입력: 점수차와 이닝의 상호작용(후반일수록 점수차가 더 결정적)
        late = X.inning / 9.0
        return np.c_[X["diff"].clip(-10, 10), X["diff"].clip(-10, 10) * late, np.sign(X["diff"]) * np.sqrt(X["diff"].abs()) * late, X.home, X.re, X.re * np.sign(X["diff"]), late, X.outs]

    class Lookup:
        key = staticmethod(lambda X: list(zip(X.inning.clip(upper=10).astype(int), X.home.astype(int), X["diff"].clip(-6, 6).astype(int))))
        def fit(self, X, y):
            self.m = {}
            for k, v in zip(self.key(X), y): a = self.m.setdefault(k, [0.0, 0]); a[0] += v; a[1] += 1
            self.mu = float(np.mean(y)); return self
        def predict(self, X):
            return np.array([(self.m[k][0] + 20 * self.mu) / (self.m[k][1] + 20) if k in self.m else self.mu for k in self.key(X)])

    def make(name):
        if name == "lookup": return Lookup()
        if name == "logit":
            class L:
                def fit(s, X, y): s.sc = StandardScaler().fit(design(X)); s.m = LogisticRegression(C=1.0, max_iter=500).fit(s.sc.transform(design(X)), y); return s
                def predict(s, X): return s.m.predict_proba(s.sc.transform(design(X)))[:, 1]
            return L()
        if name == "lgb":
            class G:
                def fit(s, X, y): s.m = lgb.LGBMClassifier(n_estimators=300, learning_rate=0.03, num_leaves=15, min_child_samples=200, subsample=0.8, subsample_freq=1, reg_lambda=10, monotone_constraints=[0, 0, 0, 0, 1, 0], verbose=-1).fit(X, y); return s
                def predict(s, X): return s.m.predict_proba(X)[:, 1]
            return G()
        if name == "cat":
            class C:
                def fit(s, X, y): s.m = CatBoostClassifier(iterations=400, depth=5, learning_rate=0.04, l2_leaf_reg=10, verbose=0, random_seed=0, monotone_constraints={"diff": 1}).fit(X, y); return s
                def predict(s, X): return s.m.predict_proba(X)[:, 1]
            return C()

    names = {"lookup": "표 조회(이닝·초말·점수차)", "logit": "로지스틱(점수차×이닝 상호작용)", "lgb": "LightGBM(점수차 단조)", "cat": "CatBoost(점수차 단조)"}
    # 선택은 경기 단위 5조각 교차검증(한 달짜리 검증 구간은 표본이 작아 흔들림), 시간 순 시험(9월 이후)은 참고로 함께 보고
    games = d.game_id.values; ug = np.unique(games); rng = np.random.RandomState(0); fold_of = dict(zip(ug, rng.randint(0, 5, len(ug)))); fo = np.array([fold_of[g] for g in games])
    cv = {k: np.zeros(len(d)) for k in list(names)}
    for f in range(5):
        trn, tst = fo != f, fo == f
        for k in names: cv[k][tst] = make(k).fit(X[trn], y[trn]).predict(X[tst])
    cv["avg"] = (cv["logit"] + cv["lgb"] + cv["cat"]) / 3
    res, preds_te = {}, {}
    trva = tr | va
    for k in names:
        preds_te[k] = make(k).fit(X[trva], y[trva]).predict(X[te])
        res[names[k]] = {"cv": ll(y, cv[k]), "test": ll(y[te], preds_te[k])}
    avg_t = (preds_te["lgb"] + preds_te["cat"] + preds_te["logit"]) / 3
    res["세 모델 평균(로지스틱+LightGBM+CatBoost)"] = {"cv": ll(y, cv["avg"]), "test": ll(y[te], avg_t)}
    res["항상 50%"] = {"cv": ll(y, np.full(len(y), 0.5)), "test": ll(y[te], np.full(te.sum(), 0.5))}
    best = min((k for k in res if k != "항상 50%"), key=lambda k: res[k]["cv"])
    for k in res: res[k] = {a: round(b, 5) for a, b in res[k].items()}
    # 전체 데이터로 다시 학습해서 모든 타석에 적용
    allm = {k: make(k).fit(X, y) for k in ("logit", "lgb", "cat", "lookup")}
    def predict_all(Xn):
        if best.startswith("세 모델"): return (allm["logit"].predict(Xn) + allm["lgb"].predict(Xn) + allm["cat"].predict(Xn)) / 3
        key = [k for k, v in names.items() if v == best][0]
        return allm[key].predict(Xn)
    return res, best, predict_all


def add_wpa(pa, RE, predict):
    """타석 시작 승리 확률(공격 팀 기준)과 그 타석이 끝난 뒤의 값으로 WPA·레버리지를 만든다."""
    pa = pa.copy()
    pa["wp0"] = predict(wp_X(pa, RE))
    nxt = pa.groupby("game_id", sort=False)
    nwp = nxt.wp0.shift(-1); nh = nxt.hf.shift(-1)
    after = np.where(nh == pa.hf, nwp, 1 - nwp)
    pa["wp1"] = np.where(nwp.isna(), pa.won, after)
    pa["wpa"] = pa.wp1 - pa.wp0
    pa["absd"] = pa.wpa.abs()
    key = list(zip(pa.inning.clip(upper=9), pa.hf, pa.diff0.clip(-4, 4), pa.outs0, (pa.bases0 > 0).astype(int)))
    pa["lk"] = key
    m = pa.groupby("lk").absd.agg(["mean", "count"]); lg = pa.absd.mean()
    li = pa.lk.map(((m["mean"] * m["count"] + lg * 30) / (m["count"] + 30)) / lg)
    pa["li"] = li.values
    pa["wpa_li"] = pa.wpa / pa.li
    return pa.drop(columns=["lk"])


# ---------------------------------------------------------------------------------------------
# 공 단위 가공: 존, 구종 무브먼트, 카운트, 구위 모델
# ---------------------------------------------------------------------------------------------
CG = ["초구", "타자 유리", "같은 카운트", "투수 유리", "2스트라이크"]
SIT = ["empty", "on", "risp", "risp2", "loaded", "close", "late", "ahead3", "behind3", "hi", "lo", "i13", "i46", "i79", "o0", "o1", "o2"]


def prep_pitches(p, pa=None):
    """공마다 결과 표시, 변화량·릴리스(근사), 카운트 묶음을 붙인다."""
    p = p.copy()
    p["swing"] = p.pitch_result.isin(SWING); p["whiff"] = p.pitch_result == "S"; p["called"] = p.pitch_result == "T"
    p["inplay"] = p.pitch_result == "H"; p["fair"] = p.pitch_result.isin(["B", "T", "S", "F", "H"])
    p["hitp"] = p.inplay & p.pa_result.isin(list(HITS)) & (p.pa_last_pitch == 1)
    # 홈플레이트까지 걸리는 시간(초): y0 + vy0 t + ay t^2 / 2 = 1.4167 ft
    a, b, c = 0.5 * p.ay, p.vy0, p.y0 - 1.4167
    t = (-b - np.sqrt(np.maximum(b * b - 4 * a * c, 0))) / (2 * a)
    p["t_plate"] = t
    sign = np.where(p.phand == "L", 1.0, -1.0)                      # 투구 팔 쪽으로 휘면 +
    p["hmov"] = 0.5 * p.ax * t * t * 12 * sign * (-1 if False else 1)   # 인치
    p["vmov"] = 0.5 * (p.az + 32.174) * t * t * 12                  # 중력 보정 후 위로 뜨는 정도(인치)
    p["relx"] = p.x0.abs() * 30.48; p["relz"] = p.z0 * 30.48       # cm
    b_, s_ = p.balls, p.strikes
    p["cg0"] = (b_ == 0) & (s_ == 0); p["cg1"] = b_ > s_; p["cg2"] = (b_ == s_) & (b_ > 0); p["cg3"] = s_ > b_; p["cg4"] = s_ == 2
    p["pg"] = p.pitch_type.map(PG).fillna(1).astype(int)
    return p


def stuff_models(p):
    """구위(공 물리 값만으로 스트라이크·헛스윙을 얼마나 만드는가) 모델 비교."""
    import lightgbm as lgb
    from catboost import CatBoostClassifier
    d = p[p.fair].copy(); y = (d.called | d.whiff).astype(int).values
    types = sorted(d.pitch_type.dropna().unique()); d["pt"] = pd.Categorical(d.pitch_type, categories=types).codes
    d["pl"] = (d.phand == "L").astype(int); d["same"] = (d.phand == d.stance).astype(int)
    phys = ["speed_kmh", "hmov", "vmov", "relx", "relz", "pt", "pl", "same"]
    loc = phys + ["xz", "zz", "balls", "strikes"]
    tr = (d.game_date < "2026-08-01").values; va = ((d.game_date >= "2026-08-01") & (d.game_date < "2026-09-01")).values; te = (d.game_date >= "2026-09-01").values

    def fit(cols, kind):
        if kind == "lgb": return lgb.LGBMClassifier(n_estimators=300, learning_rate=0.05, num_leaves=31, min_child_samples=200, subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=10, verbose=-1)
        return CatBoostClassifier(iterations=300, depth=6, learning_rate=0.08, l2_leaf_reg=10, verbose=0, random_seed=0)
    res = {}; P = {}
    mu = y[tr].mean(); res["리그 평균"] = {"val": ll(y[va], np.full(va.sum(), mu)), "test": ll(y[te], np.full(te.sum(), mu))}
    tm = pd.Series(y[tr]).groupby(d.pt.values[tr]).mean()
    pv = d.pt[va].map(tm).fillna(mu).values; pt_ = d.pt[te].map(tm).fillna(mu).values
    res["구종 평균"] = {"val": ll(y[va], pv), "test": ll(y[te], pt_)}
    for name, cols, kind in (("기계학습 LightGBM (공 물리 값만)", phys, "lgb"), ("기계학습 CatBoost (공 물리 값만)", phys, "cat"), ("참고: LightGBM (+공 위치·볼카운트)", loc, "lgb")):
        m = fit(cols, kind).fit(d[cols][tr], y[tr]); a = m.predict_proba(d[cols][va])[:, 1]
        m2 = fit(cols, kind).fit(d[cols][tr | va], y[tr | va]); b = m2.predict_proba(d[cols][te])[:, 1]
        res[name] = {"val": ll(y[va], a), "test": ll(y[te], b)}; P[name] = (a, b)
    a = (P["기계학습 LightGBM (공 물리 값만)"][0] + P["기계학습 CatBoost (공 물리 값만)"][0]) / 2; b = (P["기계학습 LightGBM (공 물리 값만)"][1] + P["기계학습 CatBoost (공 물리 값만)"][1]) / 2
    res["물리 값만: LightGBM+CatBoost 평균"] = {"val": ll(y[va], a), "test": ll(y[te], b)}
    cand = [k for k in res if k in ("구종 평균", "기계학습 LightGBM (공 물리 값만)", "기계학습 CatBoost (공 물리 값만)", "물리 값만: LightGBM+CatBoost 평균")]
    best = min(cand, key=lambda k: res[k]["val"])
    for k in res: res[k] = {a_: round(b_, 5) for a_, b_ in res[k].items()}
    # 전체 데이터로 학습해 모든 공에 적용
    lm = fit(phys, "lgb").fit(d[phys], y); cm = fit(phys, "cat").fit(d[phys], y)
    pg = d.pt.map(pd.Series(y).groupby(d.pt.values).mean())
    pred = {"구종 평균": pg.values, "기계학습 LightGBM (공 물리 값만)": lm.predict_proba(d[phys])[:, 1], "기계학습 CatBoost (공 물리 값만)": cm.predict_proba(d[phys])[:, 1]}
    pred["물리 값만: LightGBM+CatBoost 평균"] = (pred["기계학습 LightGBM (공 물리 값만)"] + pred["기계학습 CatBoost (공 물리 값만)"]) / 2
    d["stuff_p"] = pred[best]
    return res, best, d[["stuff_p"]], float(y.mean())


# ---------------------------------------------------------------------------------------------
# 집계
# ---------------------------------------------------------------------------------------------
def R(x, n=3):
    if isinstance(x, (list, tuple)): return [R(v, n) for v in x]
    if isinstance(x, dict): return {k: R(v, n) for k, v in x.items()}
    if isinstance(x, (np.floating, float)): return None if np.isnan(x) else round(float(x), n)
    if isinstance(x, np.integer): return int(x)
    return x


def sit_masks(pa):
    b, o, d, i = pa.bases0, pa.outs0, pa.diff0, pa.inning
    risp = (b & 6) > 0
    m = {"empty": b == 0, "on": b > 0, "risp": risp, "risp2": risp & (o == 2), "loaded": b == 7, "close": d.abs() <= 2, "late": (i >= 7) & (d.abs() <= 2),
         "ahead3": d >= 3, "behind3": d <= -3, "hi": pa.li >= 1.5, "lo": pa.li < 0.7, "i13": i <= 3, "i46": (i >= 4) & (i <= 6), "i79": i >= 7, "o0": o == 0, "o1": o == 1, "o2": o == 2}
    return {k: v.values for k, v in m.items()}


def cg_masks_pa(pa):
    b, s = pa.b_end, pa.s_end
    return [((b == 0) & (s == 0)).values, (b > s).values, ((b == s) & (b > 0)).values, (s > b).values, (s == 2).values]


def entity_situ(pa, col, sign):
    """선수(또는 팀) 단위 상황별 성적, 카운트 결과, 득점 기여(RE24)·승리 기여(WPA)·레버리지."""
    M = sit_masks(pa); C = cg_masks_pa(pa); arr = pa[STAT].values; re = pa.re24.values; wpa = pa.wpa.values; li = pa.li.values; wl = pa.wpa_li.values
    out = {}
    for pid, idx in pa.groupby(col).indices.items():
        a = arr[idx]
        e = {"sit": {k: a[M[k][idx]].sum(0).astype(int).tolist() for k in SIT}, "cr": [a[c[idx]].sum(0).astype(int).tolist() for c in C], "all": a.sum(0).astype(int).tolist()}
        r_ = re[idx]; e["re"] = float(np.nansum(r_)) * sign; e["re_n"] = int(np.isfinite(r_).sum())
        e["wpa"] = float(wpa[idx].sum()) * sign; e["wl"] = float(wl[idx].sum()) * sign; e["li"] = float(li[idx].mean()); e["n"] = int(len(idx))
        out[pid] = e
    return out


def rank_into(d, minpa=100):
    q = {k: v for k, v in d.items() if v["n"] >= minpa}
    for key in ("re", "wpa", "wl"):
        order = sorted(q, key=lambda k: -q[k][key])
        for rk, k in enumerate(order, 1): q[k].setdefault("rk", {})[key] = rk
    for v in d.values(): v["nq"] = len(q)
    return d


def pitch_counts(p, col):
    out = {}
    cgs = [p.cg0.values, p.cg1.values, p.cg2.values, p.cg3.values, p.cg4.values]
    M = np.c_[np.ones(len(p)), p.swing, p.whiff, p.called, p.inplay, p.hitp].astype(int); pg = p.pg.values
    for pid, idx in p.groupby(col).indices.items():
        out[pid] = {"cg": [M[idx][c[idx]].sum(0).tolist() for c in cgs], "cu": [[int(((pg[idx] == k) & c[idx]).sum()) for k in range(3)] for c in cgs]}
    return out


def zone_grids(p, col):
    out = {}
    M = np.c_[np.ones(len(p)), p.swing, p.whiff, p.called, p.inplay, p.hitp].astype(int); cell = p.cell.values; pg = p.pg.values
    for pid, idx in p.groupby(col).indices.items():
        a = np.zeros((3, 25, 6), int); np.add.at(a, (pg[idx], cell[idx]), M[idx]); out[pid] = a.reshape(-1).tolist()
    return out


def arsenal(p, col="pitcher_id"):
    def block(g):
        z = g.inzone; oz = ~g.inzone
        return [len(g), g.speed_kmh.mean(), g.speed_kmh.std(), g.speed_kmh.max(), g.hmov.mean(), g.vmov.mean(), g.relx.mean(), g.relz.mean(),
                float(np.sqrt(g.relx.var() + g.relz.var())) if len(g) > 2 else None, int(g.swing.sum()), int(g.whiff.sum()), int(g.called.sum()),
                int(z.sum()), int(oz.sum()), int((g.swing & oz).sum()), g.stuff_p.mean() if "stuff_p" in g else None]
    out = {}
    for (pid, t), g in p.groupby([col, "pitch_type"]):
        if len(g) >= 10: out.setdefault(pid, {})[t] = block(g)
    lg = {t: block(g) for t, g in p.groupby("pitch_type") if len(g) >= 50}
    return out, lg


def fatigue(p):
    fb = p[p.pitch_type.isin(["직구", "투심"])]; b = np.digitize(fb.pgame, [26, 51, 76, 101])
    out = {}
    for pid, idx in fb.groupby("pitcher_id").indices.items():
        g = fb.iloc[idx]; bb = b[idx]
        out[pid] = [[int((bb == k).sum()), float(g.speed_kmh.values[bb == k].mean()) if (bb == k).any() else None] for k in range(5)]
    lg = [[int((b == k).sum()), float(fb.speed_kmh.values[b == k].mean())] for k in range(5)]
    return out, lg


def form_model(pa):
    """최근 15경기가 앞으로 15경기를 얼마나 예측하는가. 시즌 누적(보정) / 최근(보정) / 섞기를 비교한다."""
    d = pa.copy(); d["x1"] = d.h + d.bb + d.hbp; d["x2"] = d.h + d.b2 + 2 * d.b3 + 3 * d.hr
    g = d.groupby(["batter", "date"]).agg(n=("pa", "sum"), s1=("x1", "sum"), s2=("x2", "sum")).reset_index().sort_values(["batter", "date"])
    rows = []
    for bid, gg in g.groupby("batter"):
        n, s1, s2, dt = gg.n.values, gg.s1.values, gg.s2.values, gg.date.values
        cn, c1, c2 = np.r_[0, n.cumsum()], np.r_[0, s1.cumsum()], np.r_[0, s2.cumsum()]
        for i in range(20, len(gg) - 14, 5):
            rows.append((bid, dt[i], cn[i], c1[i], c2[i], cn[i] - cn[i - 15], c1[i] - c1[i - 15], c2[i] - c2[i - 15], cn[i + 15] - cn[i], c1[i + 15] - c1[i], c2[i + 15] - c2[i]))
    A = pd.DataFrame(rows, columns="batter date N S1 S2 Nr R1 R2 Nt T1 T2".split())
    tr, va, te = A[A.date < "2026-08-01"], A[(A.date >= "2026-08-01") & (A.date < "2026-09-01")], A[A.date >= "2026-09-01"]
    full = A[A.date < "2026-09-01"]
    out = {}; picks = {}
    for tag, (S, Rr, T) in {"출루": ("S1", "R1", "T1"), "루타": ("S2", "R2", "T2")}.items():
        mu = lambda D: D[S].sum() / D.N.sum()
        def pred(D, m, k1, k2, w):
            std = (D[S] + k1 * m) / (D.N + k1); rec = (D[Rr] + k2 * m) / (D.Nr + k2)
            return (1 - w) * std + w * rec
        def mse(D, p_): return float(np.sum(D.Nt * (D[T] / D.Nt - p_) ** 2) / D.Nt.sum())
        m_tr = mu(tr); r = {}
        r["리그 평균"] = (mse(va, np.full(len(va), m_tr)), None)
        best = None
        for k1 in (50, 100, 200, 400, 800):
            l = mse(va, pred(va, m_tr, k1, 1e9, 0.0))
            if best is None or l < best[0]: best = (l, k1)
        r["시즌 누적(표본 보정)"] = (best[0], (best[1],)); k1 = best[1]
        bestr = min(((mse(va, pred(va, m_tr, 1e9, k2, 1.0)), k2) for k2 in (30, 60, 120, 250, 500)))
        r["최근 15경기(표본 보정)"] = (bestr[0], (bestr[1],))
        bb = min(((mse(va, pred(va, m_tr, k1, k2, w)), k2, w) for k2 in (30, 60, 120, 250) for w in (0.0, 0.1, 0.2, 0.3, 0.5)))
        r["시즌 누적 + 최근 15경기 섞기"] = (bb[0], (k1, bb[1], bb[2]))
        m_f = mu(full)
        t = {"리그 평균": mse(te, np.full(len(te), m_f)), "시즌 누적(표본 보정)": mse(te, pred(te, m_f, k1, 1e9, 0.0)), "최근 15경기(표본 보정)": mse(te, pred(te, m_f, 1e9, bestr[1], 1.0)), "시즌 누적 + 최근 15경기 섞기": mse(te, pred(te, m_f, k1, bb[1], bb[2]))}
        best_name = min(r, key=lambda k: r[k][0])
        out[tag] = {k: {"val": round(v[0], 6), "test": round(t[k], 6)} for k, v in r.items()}
        picks[tag] = {"best": best_name, "k1": k1, "k2": bb[1], "w": bb[2], "k2r": bestr[1], "mu": float(d[{"S1": "x1", "S2": "x2"}[S]].sum() / d.pa.sum())}
    return out, picks, len(A)


def form_estimates(pa, picks):
    d = pa.copy(); d["x1"] = d.h + d.bb + d.hbp; d["x2"] = d.h + d.b2 + 2 * d.b3 + 3 * d.hr
    g = d.groupby(["batter", "date"]).agg(n=("pa", "sum"), s1=("x1", "sum"), s2=("x2", "sum")).reset_index().sort_values(["batter", "date"])
    out = {}
    for bid, gg in g.groupby("batter"):
        n, s1, s2 = gg.n.values, gg.s1.values, gg.s2.values
        N, Nr = n.sum(), n[-15:].sum(); e = []
        for tag, sv in (("출루", s1), ("루타", s2)):
            pk = picks[tag]; m = pk["mu"]; S, Sr = sv.sum(), sv[-15:].sum(); b = pk["best"]
            k1, k2, w = {"리그 평균": (1e9, 1e9, 0.0), "시즌 누적(표본 보정)": (pk["k1"], 1e9, 0.0), "최근 15경기(표본 보정)": (1e9, pk["k2r"], 1.0)}.get(b, (pk["k1"], pk["k2"], pk["w"]))
            std = (S + k1 * m) / (N + k1); rec = (Sr + k2 * m) / (Nr + k2)
            e += [(1 - w) * std + w * rec, S / N, Sr / Nr if Nr else None]
        out[int(bid)] = e          # [예상 출루, 시즌 출루, 최근15 출루, 예상 루타, 시즌 루타, 최근15 루타] (타석당)
    return out


def main():
    p, pa, fin = load()
    pa = build_states(pa, fin); RE, tab = re_table(pa); pa = add_re24(pa, RE)
    wres, wbest, wpred = wp_models(pa, RE); pa = add_wpa(pa, RE, wpred)
    print("승리 확률", wbest, wres)
    p = prep_pitches(p)
    sres, sbest, sp, sbase = stuff_models(p)
    p["stuff_p"] = np.nan; p.loc[sp.index, "stuff_p"] = sp.stuff_p
    print("구위", sbest, sres)
    fres, fpicks, fn = form_model(pa)
    print("폼", fres)
    # ---- pitchlab.json
    zb, zp, zl = zone_grids(p, "batter_id"), zone_grids(p, "pitcher_id"), None
    ars, ars_lg = arsenal(p); fat, fat_lg = fatigue(p)
    allz = np.zeros((3, 25, 6), int); M = np.c_[np.ones(len(p)), p.swing, p.whiff, p.called, p.inplay, p.hitp].astype(int); np.add.at(allz, (p.pg.values, p.cell.values), M)
    pl = {"meta": {"season": 2026, "pg": PGN, "zlg": allz.reshape(-1).tolist(), "ars_lg": R(ars_lg), "fat_lg": R(fat_lg), "stuff_mean": float(p.stuff_p.mean()), "stuff_best": sbest, "stuff_models": sres,
                   "pitches": int(len(p)), "note": "ars 항목: [투구 수, 평균 구속, 구속 표준편차, 최고 구속, 팔 쪽 변화(인치), 위로 뜨는 정도(인치), 릴리스 옆(cm), 릴리스 높이(cm), 릴리스 흩어짐(cm), 스윙, 헛스윙, 콜 스트라이크, 존 안 공, 존 밖 공, 존 밖 스윙, 구위 예상]"},
          "b": {str(k): {"z": v} for k, v in zb.items()},
          "p": {str(k): {"z": zp[k], "ars": R(ars.get(k, {}), 2), "fat": R(fat.get(k), 2)} for k in zp}}
    json.dump(pl, open(ROOT / "public/data/pitchlab.json", "w"), ensure_ascii=False, separators=(",", ":"))
    # ---- situ.json
    sb, spp = entity_situ(pa, "batter", 1), entity_situ(pa, "pitcher", -1)
    rank_into(sb); rank_into(spp)
    cb, cp = pitch_counts(p, "batter_id"), pitch_counts(p, "pitcher_id")
    for k, v in sb.items(): v.update(cb.get(k, {}))
    for k, v in spp.items(): v.update(cp.get(k, {}))
    tb, tf = entity_situ(pa, "bat", 1), entity_situ(pa, "fld", -1)
    teams = {t: {"bat": R(tb[t], 3), "fld": R(tf[t], 3)} for t in tb}
    lgM = sit_masks(pa); arr = pa[STAT].values
    lg = {"sit": {k: arr[lgM[k]].sum(0).astype(int).tolist() for k in SIT}, "cr": [arr[c].sum(0).astype(int).tolist() for c in cg_masks_pa(pa)], "all": arr.sum(0).astype(int).tolist()}
    cgs = [p.cg0.values, p.cg1.values, p.cg2.values, p.cg3.values, p.cg4.values]
    lg["cg"] = [M[c].sum(0).tolist() for c in cgs]; lg["cu"] = [[int(((p.pg.values == k) & c).sum()) for k in range(3)] for c in cgs]
    si = {"meta": {"re": {f"{o}-{b}": round(v, 3) for (o, b), v in RE.items()}, "re_n": {f"{o}-{b}": int(c) for (o, b), c in tab["count"].items()}, "wp_models": wres, "wp_best": wbest,
                   "lg": lg, "cg": CG, "sit": SIT, "pa": int(len(pa)), "re24_pa": int(pa.re24.notna().sum())},
          "b": R(sb, 3), "p": R(spp, 3), "t": teams}
    json.dump({"b": {str(k): v for k, v in si["b"].items()}, "p": {str(k): v for k, v in si["p"].items()}, "t": si["t"], "meta": si["meta"]}, open(ROOT / "public/data/situ.json", "w"), ensure_ascii=False, separators=(",", ":"))
    # ---- form.json
    d = pa.groupby(["batter", "date"])[STAT].sum().reset_index().sort_values(["batter", "date"])
    fb = {str(b): [[dt[5:]] + [int(v) for v in row] for dt, row in zip(g.date, g[STAT].values)] for b, g in d.groupby("batter")}
    gp = pd.read_csv(SRC / "kbo_games/pitching.csv"); gp = gp[(gp.round_code == "kbo_r") & (gp.used == 1)].sort_values(["pitcher_id", "game_date"])
    fp = {str(pid): [[r.game_date[5:], r.opponent, int(r.starter), int(r.outs), int(r.pitches), int(r.hit), int(r.bb + r.hbp), int(r.kk), int(r.hr), int(r.er), None if pd.isna(r.fb_kmh) else round(float(r.fb_kmh), 1)] for r in g.itertuples()] for pid, g in gp.groupby("pitcher_id")}
    est = form_estimates(pa, fpicks)
    json.dump({"b": fb, "p": fp, "est": {str(k): R(v, 4) for k, v in est.items()}, "meta": {"models": fres, "picks": R(fpicks, 5), "n": fn}}, open(ROOT / "public/data/form.json", "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump({"win_prob": wres, "win_best": wbest, "stuff": sres, "stuff_best": sbest, "form": fres, "form_pick": fpicks}, open(ROOT / "ml/pitchlab_models.json", "w"), ensure_ascii=False, indent=1)
    for f in ("pitchlab", "situ", "form"): print(f, round((ROOT / f"public/data/{f}.json").stat().st_size / 1024), "KB")


if __name__ == "__main__":
    main()
