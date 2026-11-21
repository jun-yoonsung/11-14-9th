"""타격 자세 영상 분석용 학습 파이프라인 (OpenBiomechanics baseball_hitting 3D 관절 위치 → 참조 범위·모델). 투구용 form_ref.py의 부품을 그대로 쓴다.
데이터: https://github.com/drivelineresearch/openbiomechanics (CC BY-NC-SA 4.0, 수업 과제용). 원자료는 ml/raw/obp/ (저장소에 올리지 않음).
목표값: 배트 최고 속도(bat_speed_mph_max_x, mph) — 타구 속도는 일부 스윙에만 있어 쓰지 않는다. 배트는 영상에서 추적하지 않으므로 몸 관절만 입력으로 쓴다."""
import json, os, sys, time
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import form_ref as F
from form_ref import JOINTS, swap, align, add_estimation_noise, _smooth, _prep, _speed, _ang, _wrap, FP_HEIGHT, MIN_CLIP_S, MIN_ROT_DPS, PEAK_PAD_S, VIEWS, VIDEO_STEP

HERE = os.path.dirname(__file__)
HROOT = os.path.join(HERE, "raw", "obp", "repo", "baseball_hitting", "data")
LANDMARKS = os.path.join(HROOT, "full_sig", "hitting_landmarks.zip")
FPS = 360.0
SOURCE = "Driveline OpenBiomechanics Project — baseball_hitting (https://github.com/drivelineresearch/openbiomechanics)"
LICENSE = F.LICENSE
CT_SHIFT_S = 0.017   # 엉덩이 기준 손 속도 정점은 OBP의 타격 순간보다 중앙값 0.017초 앞선다(실측 비교, 편차 약 11ms) → 정점 + 0.017초를 타격 순간으로 본다
FP_SHIFT_HIT_S = 0.095   # 앞발목이 엉덩이 앞으로 가장 멀리 뻗은 순간 → OBP 앞발 착지(fp_100)까지의 중앙값(편차 약 36ms: 투구보다 덜 정확)
RAW = {"lsho": "lsjc", "rsho": "rsjc", "lelb": "lejc", "relb": "rejc", "lwri": "lwjc", "rwri": "rwjc", "lhip": "lhjc", "rhip": "rhjc",
       "lkne": "lkjc", "rkne": "rkjc", "lank": "lajc", "rank": "rajc"}
HIT_KEYS = ["stride_torso", "trunk_lean_deg", "knee_fp_deg", "knee_ct_deg", "hip_shoulder_sep_deg", "pelvis_rot_deg", "trunk_rot_deg",
            "trunk_rot_lag_ms", "pelvis_trunk_gap_ms", "trunk_hands_gap_ms", "fp_to_ct_ms", "hands_reach_torso"]


def load_hit():
    """스윙 표와 스윙별 3D 관절 중심. 반환 (df[session_swing,user,bat_speed,height_m,playing_level,side], {session_swing: {t, xyz:{raw:[T,3]}, events}})"""
    m = pd.read_csv(os.path.join(HROOT, "metadata.csv"))
    df = pd.DataFrame({"session_swing": m.session_swing, "user": m.user, "bat_speed": m.bat_speed_mph_max_x, "height_m": m.session_height_in * 0.0254,
                       "playing_level": m.highest_playing_level, "side": m.hitter_side})
    lm = pd.read_csv(LANDMARKS)
    sig = {}
    for k, g in lm.groupby("session_swing", sort=False):
        g = g.sort_values("time")
        sig[k] = {"t": g["time"].to_numpy(float), "xyz": {n: g[[f"{n}_x", f"{n}_y", f"{n}_z"]].to_numpy(float) for n in RAW.values()},
                  "events": {"fp": float(g.fp_100_time.iloc[0]), "ct": float(g.contact_time.iloc[0])}}
    df = df[df.session_swing.isin(sig) & df.bat_speed.notna()].reset_index(drop=True)
    return df, sig


_R = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]]).T   # 실험실(x 투수 쪽, y 오른손 타석 쪽, z 위) → (X 투수 쪽, Y 위, Z=-y)


def joints_hit(entry: dict, side: str):
    """몸의 좌우 이름(l=왼쪽) 12관절 [T,3]과 타석 쪽. 앞쪽(투수 쪽 발) = 우타자의 왼쪽."""
    return {n: entry["xyz"][raw] @ _R for n, raw in RAW.items()}, side


def _hands(S):
    return (S["lwri"] + S["rwri"]) / 2


def find_events_hit(J: dict, t: np.ndarray) -> dict:
    """{"lift","fp","ct"}: 앞발 들기 최고점·앞발 착지·손 속도 최대(타격 순간 대용)의 프레임 인덱스(못 찾으면 None). J는 맞춘 좌표(앞발 = lank)."""
    none = {"lift": None, "fp": None, "ct": None}
    t = np.asarray(t, float)
    if len(t) < 5 or t[-1] - t[0] < MIN_CLIP_S:
        return none
    S, L = _prep(J, t)
    if not L > 1e-6:
        return none
    pk = int(np.argmax(_speed(_hands(S), t, L)))
    ct = min(int(np.argmin(np.abs(t - (t[pk] + CT_SHIFT_S)))), len(t) - 1)
    hm = (S["lhip"] + S["rhip"]) / 2
    # 좌표가 엉덩이 중심이라 지면 높이를 모른다 → 앞발목이 엉덩이 앞으로 가장 멀리 뻗은 순간 + 보정을 착지로 본다(투구와 같은 방식)
    pks = int(np.argmax(S["lank"][: ct + 1, 0] - hm[: ct + 1, 0]))
    lift = int(np.argmax(S["lank"][: pks + 1, 1] - hm[: pks + 1, 1]))
    i = int(np.argmin(np.abs(t - (t[pks] + FP_SHIFT_HIT_S))))
    fp = i if pks < i < ct else None
    return {"lift": lift, "fp": fp, "ct": ct}


def features_hit(J: dict, t: np.ndarray) -> dict:
    """12개 3D 특징(키는 HIT_KEYS). 계산할 수 없는 것은 None. 길이는 몸통 길이 단위, 각도는 도, 시간은 ms."""
    out = {k: None for k in HIT_KEYS}
    t = np.asarray(t, float)
    ev = find_events_hit(J, t)
    if ev["ct"] is None:
        return out
    S, L = _prep(J, t)
    lift, fp, ct = ev["lift"], ev["fp"], ev["ct"]
    hm = (S["lhip"] + S["rhip"]) / 2; sm = (S["lsho"] + S["rsho"]) / 2
    out["trunk_lean_deg"] = _ang(sm[ct] - hm[ct], np.array([0.0, 1.0, 0.0]))
    out["knee_ct_deg"] = _ang(S["lhip"][ct] - S["lkne"][ct], S["lank"][ct] - S["lkne"][ct])
    out["hands_reach_torso"] = float((_hands(S)[ct, 0] - hm[ct, 0]) / L)
    ths = np.arctan2((S["rsho"] - S["lsho"])[:, 2], (S["rsho"] - S["lsho"])[:, 0])
    thp = np.arctan2((S["rhip"] - S["lhip"])[:, 2], (S["rhip"] - S["lhip"])[:, 0])
    out["hip_shoulder_sep_deg"] = float(np.degrees(np.max(np.abs(_wrap(ths - thp))[lift: ct + 1])))
    if fp is not None:
        out["stride_torso"] = float(((S["lank"][fp, 0] - S["rank"][fp, 0]) - (S["lank"][0, 0] - S["rank"][0, 0])) / L)
        out["knee_fp_deg"] = _ang(S["lhip"][fp] - S["lkne"][fp], S["lank"][fp] - S["lkne"][fp])
        out["fp_to_ct_ms"] = float((t[ct] - t[fp]) * 1000)
        out["pelvis_rot_deg"] = float(abs(np.degrees(_wrap(thp[ct] - thp[fp]))))
        out["trunk_rot_deg"] = float(abs(np.degrees(_wrap(ths[ct] - ths[fp]))))
        w = np.where((t >= t[fp] - PEAK_PAD_S) & (t <= t[ct] + PEAK_PAD_S))[0]
        om = lambda th: np.degrees(np.gradient(np.unwrap(th), t))
        ws, wp = np.abs(om(ths)), np.abs(om(thp))
        if len(w) and ws[w].max() >= MIN_ROT_DPS and wp[w].max() >= MIN_ROT_DPS:
            ts, tp = int(w[np.argmax(ws[w])]), int(w[np.argmax(wp[w])])
            out["trunk_rot_lag_ms"] = float((t[ts] - t[fp]) * 1000)
            out["pelvis_trunk_gap_ms"] = float((t[ts] - t[tp]) * 1000)
            out["trunk_hands_gap_ms"] = float((t[ct] - t[ts]) * 1000)
    return out


def _vec(ft):
    return [np.nan if ft[k] is None else ft[k] for k in HIT_KEYS]


def build_hit(df, sig, reps=8, seed=0, cache=None):
    if cache and os.path.exists(cache):
        z = np.load(cache)
        if z["N"] == len(df) and z["reps"] == reps:
            return z["Xc"], {v: z["Xn_" + v] for v in VIEWS}
    rng = np.random.default_rng(seed)
    prep = [(k, align(*joints_hit(sig[k], s)), sig[k]["t"]) for k, s in zip(df.session_swing, df.side)]
    Xc = np.array([_vec(features_hit(a, t)) for _, a, t in prep], float)
    Xn = {v: [] for v in VIEWS}
    for v in VIEWS:
        for r in range(reps):
            for _, a, t in prep:
                off = int(rng.integers(0, VIDEO_STEP))
                s = {n: x[off::VIDEO_STEP] for n, x in a.items()}
                Xn[v].append(_vec(features_hit(add_estimation_noise(s, v, rng), t[off::VIDEO_STEP])))
    Xn = {v: np.array(x, float) for v, x in Xn.items()}
    if cache:
        np.savez(cache, N=len(df), reps=reps, Xc=Xc, **{"Xn_" + v: x for v, x in Xn.items()})
    return Xc, Xn


def main(out_ref=None, out_model=None, out_results=None, tuned=None, reps=8, cache_name="hit_feats_r8.npz"):
    out_ref = out_ref or os.path.join(HERE, "..", "public", "data", "hit_ref.json")
    out_model = out_model or os.path.join(HERE, "..", "public", "data", "hit_model.json")
    out_results = out_results or os.path.join(HERE, "hit_models.json")
    t0 = time.time()
    df, sig = load_hit()
    y = df.bat_speed.to_numpy(float); groups = df.user.to_numpy()
    print(f"스윙 {len(df)}개, 선수 {df.user.nunique()}명", flush=True)
    Xc, Xn = build_hit(df, sig, reps=reps, cache=os.path.join(HERE, "raw", "obp", cache_name))
    ref = F.reference_ranges(Xc, y, HIT_KEYS)
    models, best, clean_rmse, importance, exported, rel = {}, {}, {}, np.zeros(len(HIT_KEYS)), {}, {k: {} for k in HIT_KEYS}
    for v in VIEWS:
        if tuned:
            models[v] = tuned[v]["models"]; prm = tuned[v]["params"]
        else:
            models[v] = F.cv_compare(Xn[v], y, groups, reps); prm = {}
        best[v] = min(models[v], key=lambda n: models[v][n]["rmse"])
        clean_rmse[v] = F.cv_compare(Xc, y, groups, 1, names=[best[v]], params=prm)[best[v]]["rmse"]
        imp = F.cv_importance(best[v], Xn[v], y, groups, reps, params=prm.get(best[v]))
        importance += imp / max(imp.sum(), 1e-12)
        final = F.make_model(best[v], prm.get(best[v])).fit(Xn[v], np.tile(y, reps))
        exported[v] = F.export_model(best[v], final, HIT_KEYS)
        exported[v]["rmse"] = round(models[v][best[v]]["rmse"], 3)
        for i, k in enumerate(HIT_KEYS):
            rel[k][v] = F.reliability_level(np.tile(Xc[:, i], reps), Xn[v][:, i], ref[k]["p75"] - ref[k]["p25"])
        print(f"[{v}] " + ", ".join(f"{n} {r['rmse']:.2f}" for n, r in models[v].items()) + f" → 최고 {best[v]} (깨끗한 입력 {clean_rmse[v]:.2f}) {time.time() - t0:.0f}초", flush=True)
    importance /= importance.sum()
    for i, k in enumerate(HIT_KEYS):
        ref[k]["importance"] = round(float(importance[i]), 4)
    rd = lambda o: {k: rd(x) for k, x in o.items()} if isinstance(o, dict) else (round(o, 4) if isinstance(o, float) else o)
    meta = {"n_swings": int(len(df)), "n_athletes": int(df.user.nunique()), "license": LICENSE, "source": SOURCE, "target": "bat_speed_mph_max",
            "playing_levels": {k: int(v) for k, v in df.playing_level.value_counts().items()}, "sides": {k: int(v) for k, v in df.side.value_counts().items()},
            "noise": {"screen_m": F.NOISE["screen_m"], "depth_m": F.NOISE["depth_m"], "fast_x": F.NOISE["fast_x"]},
            "models": models, "best": best, "clean_rmse": clean_rmse, "top_tercile_cut_mph": round(float(np.percentile(y, 200 / 3)), 1),
            "speed_sd": round(float(y.std()), 2), "reps": reps, "tuned": bool(tuned), "cv": "GroupKFold(선수) 5분할"}
    out = {"meta": rd(meta), "ref": {k: {kk: (rd(vv) if not isinstance(vv, list) else [round(z, 4) for z in vv]) for kk, vv in r.items()} for k, r in ref.items()}, "reliability": rel}
    json.dump(out, open(out_ref, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(exported, open(out_model, "w"), separators=(",", ":"))
    json.dump({"models": models, "best": best, "clean_rmse": clean_rmse, "reliability": rel, "importance": dict(zip(HIT_KEYS, importance.round(4).tolist()))}, open(out_results, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"완료 {time.time() - t0:.0f}초 · hit_ref.json {os.path.getsize(out_ref) / 1e3:.0f}KB · hit_model.json {os.path.getsize(out_model) / 1e6:.2f}MB", flush=True)


if __name__ == "__main__":
    main()


def write_hit_fixture(path=None) -> None:
    """파이썬↔자바스크립트 일치 시험 자료: OBP 실제 스윙 5개(우타 3·좌타 2, 시점별 잡음·30fps 포함). 사례 = {name, hand, t, raw, aligned, events, features}"""
    path = path or os.path.join(HERE, "..", "tests", "fixtures", "hit_parity.json")
    df, sig = load_hit(); rng = np.random.default_rng(321); cases = []
    picks = [("real_clean_R", df[df.side == "R"].session_swing.iloc[0], None, "R"), ("real_side_R", df[df.side == "R"].session_swing.iloc[7], "side", "R"),
             ("real_front_R", df[df.side == "R"].session_swing.iloc[15], "front", "R"), ("real_back_L", df[df.side == "L"].session_swing.iloc[0], "back", "L"),
             ("real_broadcast_L", df[df.side == "L"].session_swing.iloc[9], "broadcast", "L")]
    for name, k, view, side in picks:
        j, _ = joints_hit(sig[k], side); t = sig[k]["t"]
        if view:
            j = add_estimation_noise(j, view, rng)
        raw = {n: v[::VIDEO_STEP] for n, v in j.items()}; tt = t[::VIDEO_STEP]
        a = align(raw, side); ev = find_events_hit(a, tt)
        cases.append({"name": name, "hand": side, "t": [round(float(x), 6) for x in tt], "raw": {n: np.round(raw[n], 6).tolist() for n in JOINTS},
                      "aligned": {n: np.round(a[n], 6).tolist() for n in JOINTS}, "events": ev,
                      "features": {kk: (None if v is None else round(float(v), 6)) for kk, v in features_hit(a, tt).items()}})
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(cases, open(path, "w"), separators=(",", ":"))
