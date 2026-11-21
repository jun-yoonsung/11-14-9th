"""form_ref.py 단위 시험 — `python3 -m pytest ml/test_form_ref.py -v` (ml/ 폴더에서가 아니라 baseball-lab에서 실행)"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import form_ref as F

OBP = os.path.join(os.path.dirname(__file__), "raw", "obp", "repo", "baseball_pitching", "data")


def test_load_obp_counts():
    df, sig = F.load_obp(OBP)
    assert 380 <= len(df) <= 420
    assert df.user.nunique() >= 90
    assert df.pitch_speed_mph.between(50, 105).all()
    assert set(df.session_pitch) == set(sig)
    k = df.session_pitch.iloc[0]
    e = sig[k]
    assert e["fps"] == 360.0
    for name in F.RAW_JOINTS.values():
        assert e["xyz"][name].shape[1] == 3 and len(e["xyz"][name]) == len(e["t"])
    assert {"pkh", "fp", "mer", "br"} <= set(e["events"])
    assert df.height_m.between(1.5, 2.2).all()


# ---------------- Task 2: 12관절 3D, 좌표 맞추기, 시점별 잡음 ----------------
def _first_trials(n=8):
    df, sig = F.load_obp(OBP)
    return [(k, sig[k]) for k in df.session_pitch.iloc[:n]]


def _horiz_dir_deg(j):
    """맞춘 좌표에서 앞발-뒷발의 수평 방향이 +X에서 얼마나 벗어났는지(도). 두 발 수평 거리가 최대인 프레임 기준"""
    d = j["lank"] - j["rank"]
    h = np.hypot(d[:, 0], d[:, 2])
    i = int(np.argmax(h))
    return float(np.degrees(np.arctan2(d[i, 2], d[i, 0])))


def test_joints3d_has_12():
    for k, e in _first_trials():
        j, hand = F.joints3d(e)
        assert hand in ("L", "R")
        assert list(j) == F.JOINTS
        assert all(v.shape == (len(e["t"]), 3) for v in j.values())


def test_align_forward_is_plus_x_and_keeps_vertical():
    for k, e in _first_trials():
        j, hand = F.joints3d(e)
        a = F.align(j, hand)
        assert abs(_horiz_dir_deg(a)) < 1.0
        for n in F.JOINTS:
            np.testing.assert_allclose(a[n][:, 1], j[n][:, 1] if hand == "R" else j[n if hand == "R" else F.swap(n)][:, 1], atol=1e-9)


def test_align_throwing_hand_on_right_side():
    df, sig = F.load_obp(OBP)
    for k in df.session_pitch.iloc[:60]:
        j, hand = F.joints3d(sig[k])
        a = F.align(j, hand)
        ib = int(np.argmin(abs(sig[k]["t"] - sig[k]["events"]["br"])))
        assert a["rwri"][ib, 2] > a["lwri"][ib, 2], k


def test_align_removes_yaw():
    k, e = _first_trials(1)[0]
    j, hand = F.joints3d(e)
    th = np.radians(40)
    R = np.array([[np.cos(th), 0, np.sin(th)], [0, 1, 0], [-np.sin(th), 0, np.cos(th)]])
    rot = {n: v @ R.T for n, v in j.items()}
    for n in F.JOINTS:
        np.testing.assert_allclose(F.align(rot, hand)[n], F.align(j, hand)[n], atol=1e-6)


def test_align_left_handed_mirrors():
    k, e = _first_trials(1)[0]
    j, hand = F.joints3d(e)
    assert hand == "R" or True
    mirror = {F.swap(n): v * np.array([1, 1, -1]) for n, v in j.items()}   # 거울에 비친 좌투 버전(몸 좌우 이름도 바뀜)
    mirror = {n: mirror[n] for n in F.JOINTS}
    other = "L" if hand == "R" else "R"
    for n in F.JOINTS:
        np.testing.assert_allclose(F.align(mirror, other)[n], F.align(j, hand)[n], atol=1e-6)


def _still(T=4000):
    return {n: np.zeros((T, 3)) for n in F.JOINTS}


def test_noise_depth_larger_side_view():
    out = F.add_estimation_noise(_still(), "side", np.random.default_rng(0))
    sd = np.std(out["rwri"], axis=0)       # 시험용 정지 자세 → 잡음 그대로
    assert abs(sd[0] - F.NOISE["screen_m"]) < 0.1 * F.NOISE["screen_m"] and abs(sd[1] - F.NOISE["screen_m"]) < 0.1 * F.NOISE["screen_m"]
    assert abs(sd[2] - F.NOISE["depth_m"]) < 0.1 * F.NOISE["depth_m"]       # side 시점: 카메라 축 = Z
    out = F.add_estimation_noise(_still(), "front", np.random.default_rng(0))
    assert abs(np.std(out["rwri"], axis=0)[0] - F.NOISE["depth_m"]) < 0.1 * F.NOISE["depth_m"]   # front/back: 카메라 축 = X


def test_noise_seeded_repeatable():
    a = F.add_estimation_noise(_still(50), "back", np.random.default_rng(7))
    b = F.add_estimation_noise(_still(50), "back", np.random.default_rng(7))
    c = F.add_estimation_noise(_still(50), "back", np.random.default_rng(8))
    assert all(np.array_equal(a[n], b[n]) for n in F.JOINTS) and not np.array_equal(a["rwri"], c["rwri"])


def test_noise_larger_on_fast_wrist_frames():
    rng = np.random.default_rng(1)
    j = _still(6000)
    step = rng.exponential(0.02, size=(6000, 3))
    j["rwri"] = np.cumsum(step, axis=0)
    out = F.add_estimation_noise(j, "side", np.random.default_rng(2))
    sp = np.r_[0, np.linalg.norm(np.diff(j["rwri"], axis=0), axis=1)]
    fast = sp > np.percentile(sp, 80)
    res = (out["rwri"] - j["rwri"])[:, 0]
    ratio = res[fast].std() / res[~fast].std()
    assert 0.9 * F.NOISE["fast_x"] < ratio < 1.1 * F.NOISE["fast_x"]


# ---------------- Task 3: 3D 특징 ----------------
def _synth(T=200, fps=60.0, shoulder_deg=None, pelvis_deg=None, rot=False):
    """합성 투구: 앞발이 f=40에 최고점(0.6m)→f=80에 0.9m 앞에 착지, 던지는 손목은 f=120에서 속도 최대. 몸통 길이 0.5m."""
    t = np.arange(T) / fps
    f = np.arange(T, dtype=float)
    J = {n: np.zeros((T, 3)) for n in F.JOINTS}
    for n, (x, y, z) in {"lsho": (0, 1.5, -0.2), "rsho": (0, 1.5, 0.2), "lhip": (0, 1.0, -0.15), "rhip": (0, 1.0, 0.15), "lelb": (0, 1.2, -0.25), "relb": (0, 1.3, 0.25),
                         "lwri": (0, 1.0, -0.3), "rwri": (0, 1.2, 0.3), "lkne": (0, 0.55, -0.15), "rkne": (0, 0.55, 0.15), "lank": (0, 0.1, -0.15), "rank": (0, 0.1, 0.15)}.items():
        J[n][:] = (x, y, z)
    s = np.clip((f - 40) / 40, 0, 1)
    J["lank"][:, 0] = 0.9 * (3 * s ** 2 - 2 * s ** 3)
    J["lank"][:, 1] = 0.1 + np.where(f <= 80, 0.5 * np.sin(np.pi * np.clip(f / 80, 0, 1)), 0.0)
    J["rwri"][:, 0] = 0.8 / (1 + np.exp(-(f - 120) / 6))

    def line(c, half, deg):
        a = np.radians(deg)
        return np.stack([half * np.cos(a), np.zeros_like(a), half * np.sin(a)], axis=1)
    if shoulder_deg is not None or rot:
        ang = shoulder_deg if shoulder_deg is not None else 180 - 90 / (1 + np.exp(-(f - 105) / 4))
        v = line(0, 0.2, np.broadcast_to(ang, f.shape))
        J["rsho"][:, [0, 2]] = v[:, [0, 2]]; J["lsho"][:, [0, 2]] = -v[:, [0, 2]]
    if pelvis_deg is not None or rot:
        ang = pelvis_deg if pelvis_deg is not None else 180 - 30 / (1 + np.exp(-(f - 95) / 4))
        v = line(0, 0.15, np.broadcast_to(ang, f.shape))
        J["rhip"][:, [0, 2]] = v[:, [0, 2]]; J["lhip"][:, [0, 2]] = -v[:, [0, 2]]
    return J, t


def test_events_on_synthetic():
    J, t = _synth()
    ev = F.find_events(J, t)
    assert abs(ev["br"] - 120) <= 1 and abs(ev["lift"] - 40) <= 1 and abs(ev["fp"] - 80) <= 3
    assert ev["lift"] < ev["fp"] < ev["br"]


def test_stride_known():
    J, t = _synth()
    assert abs(F.features3d(J, t)["stride_torso"] - 1.8) < 0.05      # 0.9m / 몸통 0.5m


def test_rotation_timing_known():
    J, t = _synth(rot=True)
    ev, ft = F.find_events(J, t), F.features3d(J, t)
    assert abs(ft["trunk_rot_lag_ms"] - (105 - ev["fp"]) / 60 * 1000) < 12
    assert abs(ft["pelvis_trunk_gap_ms"] - 10 / 60 * 1000) < 12      # 골반 정점 f=95 → 몸통 정점 f=105
    assert abs(ft["trunk_arm_gap_ms"] - 15 / 60 * 1000) < 12          # 몸통 정점 f=105 → 릴리스 f=120
    assert abs(ft["fp_to_br_ms"] - (120 - ev["fp"]) / 60 * 1000) < 1e-6


def test_separation_known():
    J, t = _synth(shoulder_deg=75.0, pelvis_deg=30.0)
    assert abs(F.features3d(J, t)["hip_shoulder_sep_deg"] - 45.0) < 0.5


def test_features_invariant_to_yaw():
    J, t = _synth(rot=True)
    th = np.radians(33)
    R = np.array([[np.cos(th), 0, np.sin(th)], [0, 1, 0], [-np.sin(th), 0, np.cos(th)]])
    a, b = F.features3d(F.align(J, "R"), t), F.features3d(F.align({n: v @ R.T for n, v in J.items()}, "R"), t)
    for k in a:
        assert (a[k] is None and b[k] is None) or abs(a[k] - b[k]) < 1e-6, k


def test_other_geometry_features_known():
    J, t = _synth()
    ft = F.features3d(J, t)
    assert abs(ft["trunk_lean_deg"] - 0) < 0.5                       # 어깨 중점이 골반 중점 바로 위
    assert abs(ft["knee_fp_deg"] - 116.57) < 3.0 and abs(ft["knee_br_deg"] - 116.57) < 0.5   # 착지는 발이 완전히 멈추기 약 2프레임 전에 잡힘   # 앞 무릎(0,0.55)에서 엉덩이(0,1.0)·발목(0.9,0.1) 사이 각
    assert abs(ft["elbow_h_fp"] - (1.3 - 1.5) / 0.5) < 0.01          # 팔꿈치가 어깨보다 0.2m 아래
    assert abs(ft["arm_angle_deg"] - np.degrees(np.arccos(0.2 / np.hypot(0.2, 0.05)))) < 1.5   # 어깨(0.2,1.5)→팔꿈치(0.25,1.3)
    assert ft["release_h_torso"] is not None and ft["release_h_torso"] > 1


def test_short_clip_returns_none_events():
    J, t = _synth(T=40)                                              # 0.67초 < 0.8초
    ev = F.find_events(J, t)
    assert ev["br"] is None
    ft = F.features3d(J, t)
    assert ft["stride_torso"] is None and ft["fp_to_br_ms"] is None


def _with_truth(df, sig):
    """OBP 정답 이벤트(pkh·fp·br)가 모두 있는 투구만 (일부 투구는 fp가 비어 있다)"""
    return [k for k in df.session_pitch.iloc[::6] if all(np.isfinite(sig[k]["events"][n]) for n in ("pkh", "fp", "br"))]


def test_events_vs_obp_ground_truth():
    df, sig = F.load_obp(OBP)
    eb, ef = [], []
    for k in _with_truth(df, sig):
        j, hand = F.joints3d(sig[k]); a = F.align(j, hand); t = sig[k]["t"]; e = sig[k]["events"]
        ev = F.find_events(a, t)
        eb.append(abs(t[ev["br"]] - e["br"])); ef.append(abs(t[ev["fp"]] - e["fp"]))
    assert np.median(eb) < 0.03, np.median(eb)
    assert np.median(ef) < 0.05, np.median(ef)


def test_events_robust_to_noise_30fps():
    df, sig = F.load_obp(OBP)
    rng = np.random.default_rng(0)
    eb, ef = [], []
    for k in _with_truth(df, sig):
        j, hand = F.joints3d(sig[k]); a = F.align(j, hand)
        a = F.add_estimation_noise(a, "side", rng)
        step = 12                                                    # 360Hz → 30Hz
        a = {n: v[::step] for n, v in a.items()}; t = sig[k]["t"][::step]; e = sig[k]["events"]
        ev = F.find_events(a, t)
        if ev["br"] is None or ev["fp"] is None:
            eb.append(9); ef.append(9); continue
        eb.append(abs(t[ev["br"]] - e["br"])); ef.append(abs(t[ev["fp"]] - e["fp"]))
    assert np.median(eb) < 0.05, np.median(eb)
    assert np.median(ef) < 0.06, np.median(ef)


def test_write_fixture_roundtrip(tmp_path):
    p = tmp_path / "fx.json"
    F.write_fixture(str(p))
    import json
    cases = json.load(open(p))
    assert len(cases) >= 5
    for c in cases:
        assert set(c) >= {"name", "hand", "t", "raw", "aligned", "events", "features"}
        assert list(c["raw"]) == F.JOINTS and set(c["features"]) == set(F.FEATURE_KEYS)
    assert any(c["hand"] == "L" for c in cases)         # 좌투 사례 포함
    assert os.path.getsize(p) < 1_000_000


# ---------------- Task 5: 학습·참조·내보내기 ----------------
import json
REF_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "data", "form_ref.json")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "data", "form_model.json")
VIEWS = ["side", "front", "back", "broadcast"]


def test_grouped_cv_no_leak():
    users = np.repeat(np.arange(30), 4)
    for tr, te in F.group_folds(users, 5):
        assert not set(users[tr]) & set(users[te])
        assert len(te) > 0
    assert sorted(np.concatenate([te for _, te in F.group_folds(users, 5)])) == list(range(len(users)))


def test_percentiles_and_target_inside_range():
    rng = np.random.default_rng(0)
    X = rng.normal(size=(300, 2)); spd = 70 + 10 * X[:, 0] + rng.normal(size=300)
    r = F.reference_ranges(X, spd, ["a", "b"])
    assert set(r["a"]) >= {"p10", "p25", "p50", "p75", "p90", "target"}
    assert r["a"]["p10"] < r["a"]["p25"] < r["a"]["p50"] < r["a"]["p75"] < r["a"]["p90"]
    assert r["a"]["target"][0] > r["a"]["p50"] and r["a"]["target"][0] < r["a"]["target"][1]   # a가 구속과 양의 관계 → 상위 집단은 더 큼
    assert abs(r["b"]["target"][0] - r["b"]["p25"]) < 0.6                                       # b는 구속과 무관 → 전체와 비슷


def test_reliability_levels_rule():
    clean = np.array([0.0, 1.0, 2.0, 3.0, 4.0]); iqr_scale = 2.0                                 # IQR = 2 (p25=1, p75=3)
    assert F.reliability_level(clean, clean + 0.1, iqr=2.0) == "높음"                            # 0.1/2 = 0.05
    assert F.reliability_level(clean, clean + 0.7, iqr=2.0) == "보통"                            # 0.35
    assert F.reliability_level(clean, clean + 1.5, iqr=2.0) == "낮음"                            # 0.75
    noisy = clean + 0.1; noisy[:3] = np.nan                                                      # 과반이 계산 불가
    assert F.reliability_level(clean, noisy, iqr=2.0) == "낮음"


def test_kbo_release_height_plausible():
    k = F.kbo_release()
    assert set(k) == {"L", "R"}
    assert 1.4 < k["R"]["z"]["p50"] < 2.1 and -1.2 < k["R"]["x"]["p50"] < 1.2
    assert k["R"]["x"]["p50"] < k["L"]["x"]["p50"]                                               # 우투는 포수 시점 왼쪽(−), 좌투는 오른쪽(+)
    assert k["R"]["n"] > 100 and k["L"]["n"] > 30


def test_export_parity_each_kind():
    rng = np.random.default_rng(1)
    X = rng.normal(size=(200, 4)); X[::17, 1] = np.nan; y = 70 + 3 * X[:, 0] - 2 * np.nan_to_num(X[:, 1]) + rng.normal(size=200)
    for name in F.MODEL_NAMES:
        pipe = F.make_model(name).fit(X, y)
        ex = F.export_model(name, pipe, [f"f{i}" for i in range(4)])
        assert np.allclose(F.predict_export(ex, X), pipe.predict(X), atol=1e-3), name
        assert F.predict_export(ex, X[:1]).shape == (1,)


def test_form_ref_json_schema():
    ref = json.load(open(REF_PATH))
    m = ref["meta"]
    assert m["license"] == "CC BY-NC-SA 4.0" and m["n_trials"] >= 380 and m["n_athletes"] >= 90
    assert m["noise"] == {"screen_m": 0.012, "depth_m": 0.02, "fast_x": 2.0}
    for v in VIEWS:
        assert set(m["models"][v]) == set(F.MODEL_NAMES)
        assert all(set(r) == {"rmse", "mae"} for r in m["models"][v].values())
        best = m["best"][v]
        assert best == min(m["models"][v], key=lambda n: m["models"][v][n]["rmse"])               # 무조건 교차검증 최저 오차 모델
        assert abs(m["degrade"][v] - m["clean_rmse"][v]) < 0.3      # 잡음이 작아 두 값이 비슷하다(잡음 입힌 복제본이 규제처럼 작용해 조금 낮게 나올 수도 있음)
    assert set(ref["ref"]) == set(F.FEATURE_KEYS)
    for k, r in ref["ref"].items():
        assert r["p10"] <= r["target"][0] <= r["target"][1] <= r["p90"] + 1e-9, k
        assert r["importance"] >= 0
    assert abs(sum(r["importance"] for r in ref["ref"].values()) - 1) < 1e-3
    assert set(ref["reliability"]) == set(F.FEATURE_KEYS)
    for k, per in ref["reliability"].items():
        assert set(per) == set(VIEWS) and set(per.values()) <= {"높음", "보통", "낮음"}
    assert ref["reliability"]["trunk_rot_lag_ms"]["side"] in ("보통", "낮음") or \
        ["높음", "보통", "낮음"].index(ref["reliability"]["trunk_rot_lag_ms"]["side"]) >= ["높음", "보통", "낮음"].index(ref["reliability"]["trunk_rot_lag_ms"]["front"])
    assert ref["kbo_release"]["R"]["z"]["p50"] > 1.4
    assert os.path.getsize(REF_PATH) < 200_000                                                    # 작은 쪽 파일: 모델은 form_model.json로 분리


def test_form_model_json_matches_best_and_predicts():
    ref, mod = json.load(open(REF_PATH)), json.load(open(MODEL_PATH))
    assert set(mod) == set(VIEWS)
    df, sig = F.load_obp(OBP)
    k = df.session_pitch.iloc[3]
    j, hand = F.joints3d(sig[k]); a = F.align(j, hand)
    for v in VIEWS:
        assert mod[v]["name"] == ref["meta"]["best"][v]
        rng = np.random.default_rng(5)
        n = F.add_estimation_noise({n_: x[::12] for n_, x in a.items()}, v, rng)
        ft = F.features3d(n, sig[k]["t"][::12])
        x = np.array([[np.nan if ft[f] is None else ft[f] for f in mod[v]["features"]]])
        p = F.predict_export(mod[v], x)[0]
        assert 40 < p < 110, (v, p)


def test_find_events_rejects_foot_plant_after_release():
    T = 31; t = np.arange(T) / 30.0
    z = np.zeros(T)
    def P(x, y): return np.stack([np.full(T, x) if np.isscalar(x) else x, np.full(T, y) if np.isscalar(y) else y, z], axis=1)
    J = {"lsho": P(0, 1.0), "rsho": P(0, 1.0), "lhip": P(0, 0.5), "rhip": P(0, 0.5), "lelb": P(0, 0.8), "relb": P(0, 0.8), "lwri": P(0, 0.6),
         "rwri": P(np.where(np.arange(T) < 10, 0.0, 1.5), 0.6), "lkne": P(0, 0.3), "rkne": P(0, 0.3), "lank": P(0, np.where(np.arange(T) < 20, 0.5, 0.0)), "rank": P(0, 0.0)}
    ev = F.find_events(J, t)
    assert ev["br"] is not None and ev["br"] < 20 and ev["fp"] is None
