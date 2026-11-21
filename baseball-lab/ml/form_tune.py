"""투구 폼 구속 모델 튜닝 (중첩 교차검증). 시점마다 프로세스 하나:
    python3 -u ml/form_tune.py run --view side --budget-min 100 --nj 2 --tag s1 --seed 1
    python3 -u ml/form_tune.py assemble --tag s1          # 네 시점 결과를 합쳐 form_ref.json·form_model.json 생성(임시 폴더)
- 바깥: 선수 단위 5분할로 평가(잡음 입힌 입력). 안쪽: 바깥 학습 선수만으로 3분할 무작위 탐색(첫 후보 = 기본 설정).
- 모델 종류마다 시간 몫을 똑같이 나눈다. 탐색 결과는 /tmp/x/tune/<tag>/<view>.json 에 저장."""
import argparse, json, os, sys, time
import numpy as np
from joblib import Parallel, delayed

sys.path.insert(0, os.path.dirname(__file__))
import form_ref as F

HERE = os.path.dirname(__file__)
OUT = "/tmp/x/tune"
THREADS = {"extratrees": "n_jobs", "xgboost": "n_jobs", "catboost": "thread_count"}


def loguni(rng, lo, hi):
    return float(np.exp(rng.uniform(np.log(lo), np.log(hi))))


def sample(name, rng):
    if name == "ridge":
        return {}
    if name == "extratrees":
        return {"n_estimators": int(rng.choice([150, 300, 500])), "min_samples_leaf": int(rng.integers(1, 13)), "max_features": float(rng.uniform(0.3, 1.0)),
                "max_depth": [None, 5, 8, 12][int(rng.integers(0, 4))]}
    if name == "xgboost":
        return {"n_estimators": int(rng.integers(80, 600)), "max_depth": int(rng.integers(2, 7)), "learning_rate": loguni(rng, 0.01, 0.15), "subsample": float(rng.uniform(0.5, 1.0)),
                "colsample_bytree": float(rng.uniform(0.4, 1.0)), "min_child_weight": int(rng.integers(1, 13)), "reg_lambda": loguni(rng, 0.5, 30)}
    if name == "catboost":
        return {"iterations": int(rng.integers(150, 900)), "depth": int(rng.integers(3, 8)), "learning_rate": loguni(rng, 0.02, 0.15), "l2_leaf_reg": loguni(rng, 1, 30)}
    if name == "mlp":
        return {"hidden_layer_sizes": [(16,), (32,), (64,), (32, 16), (64, 32), (16, 8)][int(rng.integers(0, 6))], "alpha": loguni(rng, 1e-4, 1.0),
                "learning_rate_init": loguni(rng, 1e-4, 1e-2), "max_iter": 3000}
    raise ValueError(name)


def one_thread(name, params):
    p = dict(params or {})
    if name in THREADS:
        p[THREADS[name]] = 1
    return p


def rows(idx, N, reps):
    return np.concatenate([idx + r * N for r in range(reps)])


def inner_score(name, params, X, yt, groups, tr, N, reps, seed):
    """바깥 학습 선수(tr)만으로 3분할 교차검증 RMSE"""
    sub = groups[tr]; err = []
    for a, b in F.group_folds(sub, 3):
        ta, tb = tr[a], tr[b]
        m = F.make_model(name, one_thread(name, params)).fit(X[rows(ta, N, reps)], yt[rows(ta, N, reps)])
        err.append(m.predict(X[rows(tb, N, reps)]) - yt[rows(tb, N, reps)])
    return float(np.sqrt(np.mean(np.concatenate(err) ** 2)))


def search(name, X, yt, groups, tr, N, reps, slot_s, nj, rng):
    """시간 슬롯 동안 무작위 탐색. 첫 후보는 기본 설정. 반환 (최고 params, 시도 수)"""
    if name == "ridge":
        return {}, 1
    t_end = time.time() + slot_s
    cands = [{}]; scores = []; tried = 0
    while True:
        batch = cands[:]; cands = []
        res = Parallel(n_jobs=nj)(delayed(inner_score)(name, p, X, yt, groups, tr, N, reps, 0) for p in batch)
        scores += list(zip(res, batch)); tried += len(batch)
        if time.time() > t_end or tried >= 400:
            break
        cands = [sample(name, rng) for _ in range(nj)]
    best = min(scores, key=lambda x: x[0])
    return best[1], tried


def run(view, budget_min, nj, tag, seed):
    df, sig = F.load_obp(); df = df[df.pitch_speed_mph.notna()].reset_index(drop=True)
    y = df.pitch_speed_mph.to_numpy(float); groups = df.user.to_numpy(); N = len(y); reps = 8
    Xc, Xn = F.build_features(df, sig, reps=reps, cache=os.path.join(HERE, "raw", "obp", "form_feats_r8.npz"))
    X = Xn[view]; yt = np.tile(y, reps)
    out_dir = os.path.join(OUT, tag); os.makedirs(out_dir, exist_ok=True)
    t0 = time.time(); total = budget_min * 60
    names = F.MODEL_NAMES; slot = total * 0.92 / (len(names) - 1) / 6      # 능가할 일 없는 ridge는 탐색 없음, 나머지 4종이 시간을 똑같이 나눔(바깥 5 + 최종 1)
    rng = np.random.default_rng(seed)
    res = {"view": view, "seed": seed, "budget_min": budget_min, "models": {}, "params": {}, "tried": {}, "folds": {}}
    outer = F.group_folds(groups, 5)
    for name in names:
        err, ptry = [], []
        for fi, (tr, te) in enumerate(outer):
            prm, n = search(name, X, yt, groups, tr, N, reps, 0 if name == "ridge" else slot, nj, rng)
            m = F.make_model(name, one_thread(name, prm) if name != "ridge" else None).fit(X[rows(tr, N, reps)], yt[rows(tr, N, reps)])
            err.append(m.predict(X[rows(te, N, reps)]) - yt[rows(te, N, reps)]); ptry.append(n)
            print(f"[{view}] {name} 바깥 {fi + 1}/5 시도 {n} {time.time() - t0:.0f}초", flush=True)
        e = np.concatenate(err)
        res["models"][name] = {"rmse": float(np.sqrt(np.mean(e ** 2))), "mae": float(np.mean(np.abs(e)))}
        res["tried"][name] = ptry
        prm, n = search(name, X, yt, groups, np.arange(N), N, reps, 0 if name == "ridge" else slot, nj, rng)
        res["params"][name] = prm
        print(f"[{view}] {name} 중첩 RMSE {res['models'][name]['rmse']:.3f} · 최종 탐색 {n}개 {time.time() - t0:.0f}초 params={prm}", flush=True)
        json.dump(res, open(os.path.join(out_dir, f"{view}.json"), "w"), default=str)
    print(f"[{view}] 완료 {time.time() - t0:.0f}초 → 최고 {min(res['models'], key=lambda k: res['models'][k]['rmse'])}", flush=True)


def jsonable_params(p):
    return {k: (list(v) if isinstance(v, tuple) else v) for k, v in p.items()}


def assemble(tag):
    d = os.path.join(OUT, tag)
    tuned = {}
    for v in F.VIEWS:
        r = json.load(open(os.path.join(d, f"{v}.json")))
        r["params"] = {n: {k: (tuple(x) if k == "hidden_layer_sizes" else x) for k, x in p.items()} for n, p in r["params"].items()}
        tuned[v] = r
    F.main(out_ref=os.path.join(d, "form_ref.json"), out_model=os.path.join(d, "form_model.json"), out_results=os.path.join(d, "form_models.json"), tuned=tuned, reps=8, cache_name="form_feats_r8.npz")
    json.dump({v: {"params": {n: jsonable_params(p) for n, p in tuned[v]["params"].items()}, "tried": tuned[v]["tried"], "budget_min": tuned[v]["budget_min"]} for v in tuned}, open(os.path.join(d, "tuning.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("cmd", choices=["run", "assemble"]); ap.add_argument("--view"); ap.add_argument("--budget-min", type=float, default=100)
    ap.add_argument("--nj", type=int, default=2); ap.add_argument("--tag", default="s1"); ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    run(a.view, a.budget_min, a.nj, a.tag, a.seed) if a.cmd == "run" else assemble(a.tag)
