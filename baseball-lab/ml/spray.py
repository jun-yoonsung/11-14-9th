"""타구 방향·타구 유형 분석 데이터 만들기와 모델 비교.

사용: python3 ml/spray.py [원본_폴더]   (기본 ~/Downloads/kbo_2026_data, kbo_pitches/*.csv 필요)
결과: public/data/spray.json, ml/spray_models.json

원자료: 투구별 기록의 타석 마지막 공(pa_last_pitch=1)에 있는 문장 pa_result_text
  예) "카스트로 : 우익수 오른쪽 2루타", "김선빈 : 3루수 땅볼 아웃", "최정 : 중견수 플라이 아웃"
 → 타구가 간 수비 위치(좌익수·중견수·우익수·좌중간·우중간·1루수·2루수·유격수·3루수·투수·포수)와 결과를 뽑는다.
정확한 좌표·타구 속도·발사각은 없다. 번트와 파울플라이는 방향 분석에서 뺀다.

방향 묶음(타자가 서는 쪽 기준): 우타자는 좌익수·좌중간·3루수 쪽이 당겨 친 타구, 우익수·우중간·1루수 쪽이 밀어 친 타구.
  좌타자는 반대. 중견수·유격수·2루수·투수·포수는 가운데.
땅볼·뜬공: 안타는 땅볼/뜬공이 적혀 있지 않으므로 '아웃이 된 타구'에서만 센다(땅볼 아웃 : 뜬공 아웃).
"""
import glob, json, pathlib, re, sys, warnings
import numpy as np, pandas as pd
warnings.filterwarnings("ignore")

SRC = pathlib.Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else pathlib.Path("~/Downloads/kbo_2026_data").expanduser()
ROOT = pathlib.Path(__file__).resolve().parent.parent
ZONES = ["좌익수", "좌중간", "중견수", "우중간", "우익수", "1루수", "2루수", "유격수", "3루수", "투수", "포수"]
ZI = {z: i for i, z in enumerate(ZONES)}
ZRE = re.compile("(" + "|".join(["좌중간", "우중간"] + [z for z in ZONES if "중간" not in z]) + ")")
PULL = {"R": {"좌익수", "좌중간", "3루수"}, "L": {"우익수", "우중간", "1루수"}}
OPPO = {"R": {"우익수", "우중간", "1루수"}, "L": {"좌익수", "좌중간", "3루수"}}
HITS = {"1루타": 1, "2루타": 2, "3루타": 3, "홈런": 4}
DEFL = {"좌전": "좌익수", "중전": "중견수", "우전": "우익수"}


def parse(t, res):
    """문장 → (zone, type, 안타 루수). 방향 분석 대상이 아니면 None."""
    t = t.split(" : ", 1)[-1]
    if res in ("삼진", "볼넷", "사구", "고의4구", "희생번트", "번트아웃", "기타") or "번트" in t or "파울플라이" in t:
        return None
    m = re.search(r"맞고 (좌전|중전|우전)", t)
    z = DEFL[m.group(1)] if m else (ZRE.search(re.sub(r"\([^)]*\)", "", t)) or [None, None])[1]
    if not z:
        return None
    t2 = re.sub(r"\([^)]*\)", "", t)
    bases = HITS.get(res, 0)
    if bases: typ = "H"
    elif "라인드라이브" in t2: typ = "L"
    elif "땅볼" in t2 or "병살" in t2: typ = "G"
    elif "플라이" in t2: typ = "F"
    else: typ = "O"      # 실책·야수선택 등
    if res in ("실책출루", "야수선택"): typ = "O"
    return z, typ, bases


def load():
    cols = ["round_code", "game_date", "batter_id", "pitcher_id", "stance", "pa_result", "pa_last_pitch", "pa_result_text", "pitch_type", "speed_kmh",
            "plate_x", "plate_z", "balls", "strikes", "outs", "on_1b", "on_2b", "on_3b", "half", "home_team", "away_team", "stadium"]
    d = pd.concat(pd.read_csv(f, encoding="utf-8-sig", usecols=cols) for f in sorted(glob.glob(str(SRC / "kbo_pitches/*.csv"))))
    d = d[(d.round_code == "kbo_r") & (d.pa_last_pitch == 1)].copy()
    rows = []
    for r in d.itertuples(index=False):
        p = parse(str(r.pa_result_text), r.pa_result)
        if not p or r.stance not in ("L", "R"): continue
        z, typ, b = p
        zone_side = "pull" if z in PULL[r.stance] else "oppo" if z in OPPO[r.stance] else "center"
        bat, fld = (r.away_team, r.home_team) if r.half == "top" else (r.home_team, r.away_team)
        rows.append((r.game_date, int(r.batter_id), int(r.pitcher_id), r.stance, ZI[z], typ, b, zone_side, r.plate_x, r.plate_z, r.pitch_type, r.speed_kmh,
                     r.balls, r.strikes, r.outs, int(r.on_1b > 0 or r.on_2b > 0 or r.on_3b > 0), int(r.pa_result == "병살타"), bat, fld, r.stadium, r.home_team))
    d = pd.DataFrame(rows, columns="date batter pitcher stance zone typ bases side px pz ptype speed balls strikes outs runners dp bat fld park home".split())
    d["pg"] = d.ptype.map(PG).fillna("변화구")
    return d


SIDES = ["pull", "center", "oppo"]
PGROUPS = ["직구계", "변화구", "오프스피드"]
PG = {"직구": "직구계", "투심": "직구계", "커터": "직구계", "슬라이더": "변화구", "스위퍼": "변화구", "커브": "변화구", "너클볼": "변화구", "체인지업": "오프스피드", "포크": "오프스피드"}


def shrink(cnt, base, k):
    """묶음별 횟수 → 리그 평균 쪽으로 당긴 비율 (디리클레-다항 사후평균)."""
    cnt = np.asarray(cnt, float)
    return (cnt + k * base) / (cnt.sum() + k)


def counts(df, key):
    out = {}
    for k, g in df.groupby(key):
        out[k] = np.array([(g.side == s).sum() for s in SIDES], float)
    return out


FEATS = "left pull oppo n inside pz speed balls strikes outs runners ptype".split()


def make_X(df, cs, lg, k, scale=1.0):
    """선수 보정 비율(쓰는 횟수 cs 기준)과 공 코스·구종·구속·볼카운트를 한 표로."""
    out = []
    for r in df.itertuples():
        c = cs.get((r.batter, r.stance), np.zeros(3))
        p = shrink(c, lg[r.stance], k)
        out.append([int(r.stance == "L"), p[0], p[2], c.sum() * scale, r.px * (1 if r.stance == "L" else -1), r.pz, r.speed, r.balls, r.strikes, r.outs, r.runners, str(r.ptype)])
    return pd.DataFrame(out, columns=FEATS)


def make_X_train(df, lg, k, folds=5, seed=0):
    """학습용: 자기 타구가 비율에 섞여 정답이 새지 않도록, 5조각으로 나눠 다른 조각의 기록만으로 선수 비율을 만든다."""
    rng = np.random.RandomState(seed)
    f = rng.randint(0, folds, len(df))
    parts = []
    for i in range(folds):
        cs = counts(df[f != i], ["batter", "stance"])
        x = make_X(df[f == i], cs, lg, k, scale=folds / (folds - 1)); x.index = np.where(f == i)[0]; parts.append(x)
    return pd.concat(parts).sort_index()


def eval_ll(pred, y):
    p = np.clip(pred, 1e-6, 1)
    return float(-np.mean(np.log(p[np.arange(len(y)), y])))


def compare(df):
    """시간 순으로 학습(~7월) / 검증(8월) / 시험(9월~) 으로 나눠 다음 타구 방향 맞히기."""
    tr = df[df.date < "2026-08-01"]; va = df[(df.date >= "2026-08-01") & (df.date < "2026-09-01")]; te = df[df.date >= "2026-09-01"]
    y = lambda x: x.side.map({s: i for i, s in enumerate(SIDES)}).values
    lg = {s: np.array([(tr[tr.stance == s].side == q).mean() for q in SIDES]) for s in "LR"}

    def rate_model(train, test, k):
        cs = counts(train, ["batter", "stance"])
        return np.array([shrink(cs.get((b, s), np.zeros(3)), lg[s], k) for b, s in zip(test.batter, test.stance)])

    res = {}
    res["리그 평균(타석 방향 구분만)"] = {"val": eval_ll(np.array([lg[s] for s in va.stance]), y(va)), "test": eval_ll(np.array([lg[s] for s in te.stance]), y(te))}
    res["선수 기록 그대로"] = {"val": eval_ll(rate_model(tr, va, 1e-3), y(va)), "test": None}
    ks = [5, 10, 20, 40, 80, 160, 320]
    vk = {k: eval_ll(rate_model(tr, va, k), y(va)) for k in ks}
    kbest = min(vk, key=vk.get)
    full = pd.concat([tr, va])
    res["선수 기록 + 리그 평균 보정(k=%d)" % kbest] = {"val": vk[kbest], "test": eval_ll(rate_model(full, te, kbest), y(te))}
    res["선수 기록 그대로"]["test"] = eval_ll(rate_model(full, te, 1e-3), y(te))

    # 투구 상황까지 쓰는 기계학습 모델: 선수 보정 비율 + 공 코스·구종·구속·볼카운트
    import lightgbm as lgb
    from catboost import CatBoostClassifier
    cats = sorted(df.ptype.dropna().astype(str).unique())
    def run(train, test):
        Xtr, Xte = make_X_train(train, lg, kbest), make_X(test, counts(train, ["batter", "stance"]), lg, kbest)
        yt = y(train)
        Xl, Xl2 = Xtr.copy(), Xte.copy()
        Xl["ptype"] = pd.Categorical(Xl.ptype, categories=cats); Xl2["ptype"] = pd.Categorical(Xl2.ptype, categories=cats)
        m = lgb.LGBMClassifier(n_estimators=250, learning_rate=0.03, num_leaves=15, min_child_samples=60, subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=5, verbose=-1)
        m.fit(Xl, yt); pl = m.predict_proba(Xl2)
        cb = CatBoostClassifier(iterations=500, depth=5, learning_rate=0.04, l2_leaf_reg=8, loss_function="MultiClass", verbose=0, random_seed=0, cat_features=["ptype"])
        cb.fit(Xtr, yt); pc = cb.predict_proba(Xte)
        return pl, pc
    pl, pc = run(tr, va)
    res["LightGBM(선수 보정 비율+코스·구종·구속·볼카운트)"] = {"val": eval_ll(pl, y(va))}
    res["CatBoost(같은 입력)"] = {"val": eval_ll(pc, y(va))}
    res["두 기계학습 모델 평균"] = {"val": eval_ll((pl + pc) / 2, y(va))}
    pl2, pc2 = run(full, te)
    res["LightGBM(선수 보정 비율+코스·구종·구속·볼카운트)"]["test"] = eval_ll(pl2, y(te))
    res["CatBoost(같은 입력)"]["test"] = eval_ll(pc2, y(te))
    res["두 기계학습 모델 평균"]["test"] = eval_ll((pl2 + pc2) / 2, y(te))
    # 코스 부호 확인: inside(안쪽) 공일수록 당긴 비율이 높아야 한다
    d = df.copy(); d["inside"] = d.px * np.where(d.stance == "L", 1, -1)
    q = pd.qcut(d.inside, 3, labels=["바깥쪽", "가운데", "안쪽"])
    sign = d.groupby(q).apply(lambda g: float((g.side == "pull").mean())).to_dict()
    return res, kbest, vk, {k: round(v, 3) for k, v in sign.items()}, {"train": len(tr), "val": len(va), "test": len(te)}


def export(df, kbest, res, sign, sizes):
    """선수별 요약과 CatBoost가 계산한 코스별 방향 경향을 public/data/spray.json 으로 저장."""
    from catboost import CatBoostClassifier
    df = df.copy()
    df["inside"] = df.px * np.where(df.stance == "L", 1, -1)
    edges = [float(x) for x in df.inside.quantile([1 / 3, 2 / 3])]
    df["course"] = np.digitize(df.inside, edges)            # 0 바깥쪽, 1 가운데, 2 안쪽
    lg = {s: np.array([(df[df.stance == s].side == q).mean() for q in SIDES]) for s in "LR"}
    cats = sorted(df.ptype.dropna().astype(str).unique())
    cs = counts(df, ["batter", "stance"])

    ytr = df.side.map({s: i for i, s in enumerate(SIDES)}).values
    cb = CatBoostClassifier(iterations=500, depth=5, learning_rate=0.04, l2_leaf_reg=8, loss_function="MultiClass", verbose=0, random_seed=0, cat_features=["ptype"])
    Xtr = make_X_train(df, lg, kbest)
    cb.fit(Xtr, ytr)
    import lightgbm as lgb
    Xl = Xtr.copy(); Xl["ptype"] = pd.Categorical(Xl.ptype, categories=cats)
    gb = lgb.LGBMClassifier(n_estimators=250, learning_rate=0.03, num_leaves=15, min_child_samples=60, subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=5, verbose=-1)
    gb.fit(Xl, ytr)
    def predict(sc):
        X = make_X(sc, cs, lg, kbest); Xg = X.copy(); Xg["ptype"] = pd.Categorical(Xg.ptype, categories=cats)
        return (cb.predict_proba(X) + gb.predict_proba(Xg)) / 2
    mid = [float(df[df.course == c].inside.median()) for c in range(3)]
    fast = df[df.ptype == "직구"]
    pz, sp = float(df.pz.median()), float(fast.speed.median())

    def block(g):
        z = [int((g.zone == i).sum()) for i in range(11)]
        zh = [int(((g.zone == i) & (g.bases > 0)).sum()) for i in range(11)]
        zx = [int(((g.zone == i) & (g.bases >= 2)).sum()) for i in range(11)]
        return {"n": len(g), "z": z, "zh": zh, "zx": zx,
                "ty": [int((g.typ == t).sum()) for t in "GFL"], "hr": int((g.bases == 4).sum()),
                "sd": [int((g.side == s).sum()) for s in SIDES], "sh": [int(((g.side == s) & (g.bases > 0)).sum()) for s in SIDES],
                "dp": int(g.dp.sum()), "xb": int((g.bases >= 2).sum()), "h": int((g.bases > 0).sum()),
                "pg": [[int((g.pg == q).sum())] + [int(((g.pg == q) & (g.side == s)).sum()) for s in SIDES] + [int(((g.pg == q) & (g.bases > 0)).sum())] for q in PGROUPS]}
    out = {"b": {}, "p": {}}
    for pid, g in df.groupby("batter"):
        e = block(g)
        e["st"] = {s: int((g.stance == s).sum()) for s in "LR" if (g.stance == s).sum()}
        e["cr"] = [[int(((g.course == c) & (g.side == s)).sum()) for s in SIDES] for c in range(3)]
        main = "L" if e["st"].get("L", 0) >= e["st"].get("R", 0) else "R"
        # 선수 보정 비율(타석 방향 비율이 아니라 서는 쪽별 비율을 섞는다)
        e["main"] = main
        base = sum(e["st"].get(s, 0) * lg[s] for s in "LR") / max(1, sum(e["st"].values()))
        e["sm"] = [round(float(v), 4) for v in shrink(e["sd"], base, kbest)]
        sc = pd.DataFrame([dict(batter=pid, stance=main, px=mid[c] * (1 if main == "L" else -1), pz=pz, speed=sp, balls=1, strikes=1, outs=1, runners=0, ptype="직구") for c in range(3)])
        e["md"] = [[round(float(v), 4) for v in row] for row in predict(sc)]
        out["b"][str(pid)] = e
    for pid, g in df.groupby("pitcher"):
        out["p"][str(pid)] = block(g)
    lgall = block(df)
    out["t"] = {t: {"bat": block(df[df.bat == t]), "fld": block(df[df.fld == t])} for t in sorted(set(df.bat))}
    out["s"] = {}
    for pk, g in df.groupby("park"):
        e = block(g)
        e["home"] = [t for t, c in g.home.value_counts().items() if c > len(g) * 0.2]      # 홈팀(잠실은 LG·두산)
        out["s"][pk] = e
    out["meta"] = {"season": 2026, "zones": ZONES, "pgroups": PGROUPS, "sides": SIDES, "k": kbest, "edges": edges, "n": len(df), "league": lgall,
                   "league_side": {s: [round(float(v), 4) for v in lg[s]] for s in "LR"},
                   "course_pull": sign, "sizes": sizes,
                   "models": {k: {a: (round(b, 4) if b is not None else None) for a, b in v.items()} for k, v in res.items()},
                   "model_pick": "CatBoost와 LightGBM 평균"}
    p = ROOT / "public/data/spray.json"
    json.dump(out, open(p, "w"), ensure_ascii=False, separators=(",", ":"))
    print("저장", p, round(p.stat().st_size / 1024), "KB; 타자", len(out["b"]), "투수", len(out["p"]))


if __name__ == "__main__":
    df = load()
    print("방향 분석에 쓰는 타구", len(df))
    res, kbest, vk, sign, sizes = compare(df)
    for k, v in res.items(): print(f"{k:55s} val {v['val']:.4f}  test {v['test']:.4f}")
    print("k별 검증 손실", {k: round(v, 4) for k, v in vk.items()}); print("코스별 당김 비율", sign, sizes)
    json.dump({"results": res, "k": kbest, "sizes": sizes, "course_pull": sign}, open(ROOT / "ml/spray_models.json", "w"), ensure_ascii=False, indent=1)
    export(df, kbest, res, sign, sizes)
