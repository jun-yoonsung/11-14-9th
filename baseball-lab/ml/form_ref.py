"""투구 폼 영상 분석용 학습 파이프라인 (OpenBiomechanics 3D 관절 위치 → 참조 범위·모델).
데이터: https://github.com/drivelineresearch/openbiomechanics (CC BY-NC-SA 4.0, 수업 과제용). 원자료는 ml/raw/obp/ (저장소에 올리지 않음).
설계: docs/superpowers/specs/2026-11-21-video-pitching-form-design.md"""
import os
import numpy as np
import pandas as pd

OBP_ROOT = os.path.join(os.path.dirname(__file__), "raw", "obp", "repo", "baseball_pitching", "data")
FPS = 360.0

# 사이트의 12관절 이름 → OBP landmarks.csv 열 접두사. 던지는 쪽을 항상 r로 둔다(r = 던지는 팔·뒷발 쪽, l = 글러브 팔·앞발 쪽).
RAW_JOINTS = {
    "lsho": "glove_shoulder_jc", "rsho": "shoulder_jc",
    "lelb": "glove_elbow_jc", "relb": "elbow_jc",
    "lwri": "glove_wrist_jc", "rwri": "wrist_jc",
    "lhip": "lead_hip", "rhip": "rear_hip",
    "lkne": "lead_knee_jc", "rkne": "rear_knee_jc",
    "lank": "lead_ankle_jc", "rank": "rear_ankle_jc",
}
EVENT_COLS = {"pkh": "pkh_time", "fp": "fp_100_time", "mer": "MER_time", "br": "BR_time"}


def load_obp(root: str = OBP_ROOT):
    """투구(trial) 표와 투구별 3D 관절 중심을 읽는다.
    반환: (df[session_pitch,user,pitch_speed_mph,height_m,playing_level], {session_pitch: {"t","fps","xyz":{raw이름:[T,3]},"events":{pkh,fp,mer,br}}})"""
    meta = pd.read_csv(os.path.join(root, "metadata.csv"))
    df = meta.rename(columns={"session_height_m": "height_m"})[["session_pitch", "user", "pitch_speed_mph", "height_m", "playing_level"]].copy()
    lm = pd.read_csv(os.path.join(root, "full_sig", "landmarks.zip"))
    sig = {}
    for k, g in lm.groupby("session_pitch", sort=False):
        g = g.sort_values("time")
        sig[k] = {
            "t": g["time"].to_numpy(float), "fps": FPS,
            "xyz": {n: g[[f"{n}_x", f"{n}_y", f"{n}_z"]].to_numpy(float) for n in RAW_JOINTS.values()},
            "events": {e: float(g[c].iloc[0]) for e, c in EVENT_COLS.items()},
        }
    df = df[df.session_pitch.isin(sig)].reset_index(drop=True)
    return df, sig


# ---------------- Task 2: 12관절 3D, 좌표 맞추기, 시점별 잡음 ----------------
# 맞춘 좌표계: X = 투구 방향(홈 쪽 +), Y = 위(+), Z = X×Y(오른쪽 +). 단위 m. 관절 이름은 몸의 좌우(l=왼쪽, r=오른쪽).
JOINTS = ["lsho", "rsho", "lelb", "relb", "lwri", "rwri", "lhip", "rhip", "lkne", "rkne", "lank", "rank"]


def swap(n: str) -> str:
    """몸의 좌우 이름을 바꾼다 (lsho <-> rsho)"""
    return ("r" if n[0] == "l" else "l") + n[1:]


def joints3d(entry: dict):
    """OBP 투구 한 개 → (몸 좌우 이름의 12관절 [T,3] (Y 위·오른손 좌표, 방향은 실험실 그대로), 던지는 손 "L"|"R").
    OBP 실험실 좌표(x 앞, y 옆, z 위)를 (x, z, -y)로 바꾼다. 던지는 손은 릴리스 때 던지는 손목이 글러브 손목보다 오른쪽(Z 큼)이면 R."""
    X = {n: v @ np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]]).T for n, v in entry["xyz"].items()}
    ib = int(np.argmin(abs(entry["t"] - entry["events"]["br"])))
    hand = "R" if X["wrist_jc"][ib, 2] > X["glove_wrist_jc"][ib, 2] else "L"
    j = {}
    for n, raw in RAW_JOINTS.items():           # RAW_JOINTS의 r* = 던지는 쪽, l* = 반대쪽
        body = n if hand == "R" else swap(n)    # 좌투면 던지는 쪽이 몸의 왼쪽
        j[body] = X[raw]
    return {n: j[n] for n in JOINTS}, hand


def align(j3d: dict, hand: str) -> dict:
    """좌표를 "수직축 Y + 투구 방향 +X"로 맞춘다. 좌투는 몸 좌우 이름을 바꾸고 Z를 뒤집어 우투와 같은 규칙으로 통일.
    투구 방향 = 두 발의 수평 거리가 가장 벌어진 프레임에서 뒷발(rank)→앞발(lank) 방향 (뒷발=던지는 쪽 발)."""
    if hand == "L":
        j3d = {n: j3d[swap(n)] * np.array([1.0, 1.0, -1.0]) for n in JOINTS}
    d = j3d["lank"] - j3d["rank"]
    h = np.hypot(d[:, 0], d[:, 2])
    i = int(np.argmax(h))
    if h[i] < 1e-6:
        return _hip_center({n: j3d[n].copy() for n in JOINTS})
    th = np.arctan2(d[i, 2], d[i, 0])
    c, s = np.cos(th), np.sin(th)
    out = {}
    for n in JOINTS:
        v = j3d[n]
        out[n] = np.stack([v[:, 0] * c + v[:, 2] * s, v[:, 1], -v[:, 0] * s + v[:, 2] * c], axis=1)
    return _hip_center(out)


def _hip_center(J: dict) -> dict:
    """프레임마다 두 엉덩이의 가운데를 원점으로 옮긴다. MediaPipe 월드 좌표가 이미 이렇게 나오므로(지면·이동 정보 없음) 모의 자료도 같은 조건으로 만든다."""
    hm = (J["lhip"] + J["rhip"]) / 2
    return {n: v - hm for n, v in J.items()}


NOISE = {"screen_m": 0.012, "depth_m": 0.02, "depth_unknown_m": 0.016, "fast_x": 2.0}   # 실제 MediaPipe 프레임 간 떨림을 잰 값에 맞춤(2026-11-21 시험 영상 181프레임, 관절별 중앙 절대편차 0.006~0.024m). 떨림만 잰 것이라 하한이며 시스템 오차·빠른 동작의 번짐은 못 잼
_FAST_JOINTS = ("lwri", "rwri", "lank", "rank")
_DEPTH_AXIS = {"side": (0.0, 0.0, 1.0), "front": (1.0, 0.0, 0.0), "back": (1.0, 0.0, 0.0),
               "broadcast": (np.cos(np.radians(15)), -np.sin(np.radians(15)), 0.0)}


def add_estimation_noise(j3d: dict, view: str, rng: np.random.Generator, scale: float = 1.0) -> dict:
    """영상 한 대의 3D 추정이 모션캡처보다 부정확한 것을 흉내 낸다: 화면 방향 σ=0.03m, 카메라 깊이 방향 σ=0.08m(시점 unknown은 방향을 모르므로
    무작위 수평 방향에 σ=0.06m). 손목·발목은 속도 상위 20% 프레임에서 ×1.5. 프레임마다 독립."""
    T = len(next(iter(j3d.values())))
    if view == "unknown":
        a = rng.uniform(0, 2 * np.pi)
        d, sd_depth = np.array([np.cos(a), 0.0, np.sin(a)]), NOISE["depth_unknown_m"]
    else:
        d, sd_depth = np.array(_DEPTH_AXIS[view]), NOISE["depth_m"]
    sd_screen = NOISE["screen_m"]
    out = {}
    for n in JOINTS:
        eps = rng.standard_normal((T, 3))
        par = (eps @ d)[:, None] * d[None, :]
        noise = (sd_screen * (eps - par) + sd_depth * par) * scale
        if n in _FAST_JOINTS:
            sp = np.r_[0.0, np.linalg.norm(np.diff(j3d[n], axis=0), axis=1)]
            noise[sp > np.percentile(sp, 80)] *= NOISE["fast_x"]
        out[n] = j3d[n] + noise
    return _hip_center(out)   # 영상 추정기는 추정한 엉덩이 가운데를 원점으로 내보낸다


# ---------------- Task 3: 순간 찾기와 3D 특징 (브라우저 src/lib/form.js와 같은 알고리즘) ----------------
FEATURE_KEYS = ["stride_torso", "trunk_lean_deg", "knee_fp_deg", "knee_br_deg", "arm_angle_deg", "elbow_h_fp", "release_h_torso",
                "hip_shoulder_sep_deg", "trunk_rot_lag_ms", "pelvis_trunk_gap_ms", "trunk_arm_gap_ms", "fp_to_br_ms"]
SMOOTH_S = 0.10       # 위치를 이 시간 창(초)으로 이동평균
MIN_CLIP_S = 0.8      # 이보다 짧은 구간은 순간을 찾지 않는다
MIN_STRIDE_L = 0.25     # 앞발목이 몸통 길이의 이만큼도 앞으로 뻗지 않으면 보폭이 없는 것으로 보고 착지를 만들지 않는다
BR_SHIFT_S = 0.036     # 엉덩이 기준 손목 속도 정점 → 실제 릴리스는 이만큼 앞(OBP 정답과 비교한 중앙값, 편차 약 6ms)
FP_SHIFT_S = 0.108     # 앞발목이 엉덩이 앞으로 가장 멀리 뻗은 순간 → 실제 착지까지(OBP 정답과 비교한 중앙값, 아래 보정 시험 참고)
FP_HEIGHT = 0.08      # 앞발 착지: 발 들기 이후 앞발목 높이가 구간 최저점 + 이 값(몸통길이) 안으로 처음 내려온 프레임 (속도 조건은 쓰지 않는다: 착지 순간에도 발목 관절 중심이 계속 움직여 늦게 잡히고, 30fps 잡음에서는 실패함)
MIN_ROT_DPS = 30.0    # 회전 속도 정점이 이보다 작으면 "회전이 없음"으로 보고 시각 지표를 비운다
PEAK_PAD_S = 0.05     # 회전 정점을 찾는 창: [착지 - 0.05초, 릴리스 + 0.05초]


def _smooth(v: np.ndarray, t: np.ndarray, win=None) -> np.ndarray:
    """시각 t 기준 이동평균(창 = |t_j - t_i| <= win/2). 프레임 간격이 일정하지 않아도 된다."""
    win = SMOOTH_S if win is None else win
    out = np.empty_like(v)
    for i in range(len(t)):
        m = np.abs(t - t[i]) <= win / 2 + 1e-12
        out[i] = v[m].mean(axis=0)
    return out


def _prep(J: dict, t: np.ndarray):
    S = {n: _smooth(J[n], t) for n in JOINTS}
    sm = (S["lsho"] + S["rsho"]) / 2; hm = (S["lhip"] + S["rhip"]) / 2
    L = float(np.mean(np.linalg.norm(sm - hm, axis=1)))
    return S, L


def _speed(v: np.ndarray, t: np.ndarray, L: float) -> np.ndarray:
    return np.linalg.norm(np.gradient(v, t, axis=0), axis=1) / L


def find_events(J: dict, t: np.ndarray) -> dict:
    """{"lift","fp","br"}: 발 들기 최고점·앞발 착지·릴리스의 프레임 인덱스(못 찾으면 None). J는 맞춘 좌표(던지는 쪽 = r, 앞발 = lank)."""
    none = {"lift": None, "fp": None, "br": None}
    t = np.asarray(t, float)
    if len(t) < 5 or t[-1] - t[0] < MIN_CLIP_S:
        return none
    S, L = _prep(J, t)
    if not L > 1e-6:
        return none
    pkw = int(np.argmax(_speed(S["rwri"], t, L)))
    br = int(np.argmin(np.abs(t - (t[pkw] - BR_SHIFT_S))))   # 엉덩이 기준 손목 속도 정점은 실제 릴리스보다 늦다
    hm = (S["lhip"] + S["rhip"]) / 2
    # 좌표가 엉덩이 중심이라 지면 높이를 알 수 없다. 앞발목이 엉덩이 앞으로 가장 멀리 뻗은 순간(보폭 최대)은 착지보다 일정하게 앞서므로(모션캡처로 보정한 FP_SHIFT_S) 그것으로 착지를 잡는다.
    pk = int(np.argmax(S["lank"][: br + 1, 0] - hm[: br + 1, 0]))
    lift = int(np.argmax((S["lank"][: pk + 1, 1] - hm[: pk + 1, 1])))
    i = int(np.argmin(np.abs(t - (t[pk] + FP_SHIFT_S))))
    reach = (S["lank"][pk, 0] - hm[pk, 0]) - (S["lank"] - hm)[: pk + 1, 0].min()   # 앞발목이 실제로 앞으로 뻗었는가
    fp = i if pk < i < br and reach > MIN_STRIDE_L * L else None   # 착지는 보폭 최대 뒤, 릴리스 앞이어야 한다(앞발 들기 꼭대기가 뚜렷하지 않은 영상도 있다)
    return {"lift": lift, "fp": fp, "br": br}


def _ang(a: np.ndarray, b: np.ndarray) -> float:
    c = float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))
    return float(np.degrees(np.arccos(np.clip(c, -1, 1))))


def _wrap(x):
    return (x + np.pi) % (2 * np.pi) - np.pi


def features3d(J: dict, t: np.ndarray) -> dict:
    """12개 3D 특징(키는 FEATURE_KEYS). 계산할 수 없는 것은 None. 길이는 몸통 길이 단위, 각도는 도, 시간은 ms."""
    out = {k: None for k in FEATURE_KEYS}
    t = np.asarray(t, float)
    ev = find_events(J, t)
    if ev["br"] is None:
        return out
    S, L = _prep(J, t)
    lift, fp, br = ev["lift"], ev["fp"], ev["br"]
    hm = (S["lhip"] + S["rhip"]) / 2; sm = (S["lsho"] + S["rsho"]) / 2
    out["trunk_lean_deg"] = _ang(sm[br] - hm[br], np.array([0.0, 1.0, 0.0]))
    out["knee_br_deg"] = _ang(S["lhip"][br] - S["lkne"][br], S["lank"][br] - S["lkne"][br])
    u = S["rsho"][br] - S["relb"][br]
    out["arm_angle_deg"] = _ang(S["relb"][br] - S["rsho"][br], np.array([0.0, -1.0, 0.0]))
    ground = min(S["lank"][:, 1].min(), S["rank"][:, 1].min())
    out["release_h_torso"] = float((S["rwri"][br, 1] - ground) / L)
    if fp is not None:
        out["stride_torso"] = float((S["lank"][fp, 0] - S["rank"][fp, 0]) / L)
        out["knee_fp_deg"] = _ang(S["lhip"][fp] - S["lkne"][fp], S["lank"][fp] - S["lkne"][fp])
        out["elbow_h_fp"] = float((S["relb"][fp, 1] - S["rsho"][fp, 1]) / L)
        out["fp_to_br_ms"] = float((t[br] - t[fp]) * 1000)
    # 회전: 어깨선·골반선(오른쪽 − 왼쪽)을 수평면(X,Z)에 투영한 방향
    ths = np.arctan2((S["rsho"] - S["lsho"])[:, 2], (S["rsho"] - S["lsho"])[:, 0])
    thp = np.arctan2((S["rhip"] - S["lhip"])[:, 2], (S["rhip"] - S["lhip"])[:, 0])
    out["hip_shoulder_sep_deg"] = float(np.degrees(np.max(np.abs(_wrap(ths - thp))[lift: br + 1])))
    if fp is not None:
        w = np.where((t >= t[fp] - PEAK_PAD_S) & (t <= t[br] + PEAK_PAD_S))[0]
        om = lambda th: np.degrees(np.gradient(np.unwrap(th), t))
        ws, wp = np.abs(om(ths)), np.abs(om(thp))
        if len(w) and ws[w].max() >= MIN_ROT_DPS and wp[w].max() >= MIN_ROT_DPS:
            ts, tp = int(w[np.argmax(ws[w])]), int(w[np.argmax(wp[w])])
            out["trunk_rot_lag_ms"] = float((t[ts] - t[fp]) * 1000)
            out["pelvis_trunk_gap_ms"] = float((t[ts] - t[tp]) * 1000)
            out["trunk_arm_gap_ms"] = float((t[br] - t[ts]) * 1000)
    return out


def write_fixture(path: str = os.path.join(os.path.dirname(__file__), "..", "tests", "fixtures", "form_parity.json")) -> None:
    """파이썬↔자바스크립트 일치 시험 자료: 합성 2개 + OBP 실제 투구 4개(좌투 포함, 잡음·30fps 적용 포함).
    각 사례 = {name, hand, t, raw(몸 좌우 이름·정렬 전), aligned, events, features}"""
    import json
    from test_form_ref import _synth
    df, sig = load_obp()
    rng = np.random.default_rng(123)
    cases = []

    def add(name, raw, t, hand):
        a = align(raw, hand)
        ev = find_events(a, t)
        cases.append({"name": name, "hand": hand, "t": [round(float(x), 6) for x in t],
                      "raw": {n: np.round(raw[n], 6).tolist() for n in JOINTS}, "aligned": {n: np.round(a[n], 6).tolist() for n in JOINTS},
                      "events": ev, "features": {k: (None if v is None else round(float(v), 6)) for k, v in features3d(a, t).items()}})
    J, t = _synth(rot=True); add("synthetic_rot", J, t, "R")
    J, t = _synth(shoulder_deg=75.0, pelvis_deg=30.0); add("synthetic_static_rot", J, t, "R")
    hands = {}
    for k in df.session_pitch:
        j, hand = joints3d(sig[k]); hands.setdefault(hand, []).append(k)
    picks = [("real_clean_R", hands["R"][0], None), ("real_noisy_side_R", hands["R"][5], "side"), ("real_noisy_front_R", hands["R"][9], "front")]
    if hands.get("L"):
        picks.append(("real_noisy_back_L", hands["L"][0], "back"))
    for name, k, view in picks:
        j, hand = joints3d(sig[k]); t = sig[k]["t"]
        if view:
            j = add_estimation_noise(j, view, rng)
        step = 12
        add(name, {n: v[::step] for n, v in j.items()}, t[::step], hand)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(cases, open(path, "w"), separators=(",", ":"))


# ---------------- Task 5: 학습 — 참조 범위·시점별 신뢰도·모델 비교·KBO 릴리스·내보내기 ----------------
import json
import time

VIEWS = ["side", "front", "back", "broadcast"]
MODEL_NAMES = ["ridge", "extratrees", "xgboost", "catboost", "mlp"]
LICENSE = "CC BY-NC-SA 4.0"
SOURCE = "Driveline OpenBiomechanics Project — baseball_pitching (https://github.com/drivelineresearch/openbiomechanics)"
REPS = 4                    # 투구마다 잡음을 다르게 입힌 복제 수 (학습·평가 모두)
VIDEO_STEP = 12             # 360Hz → 30fps


def group_folds(groups, k: int = 5):
    """선수(group)가 학습·평가에 겹치지 않는 k분할 [(train_idx, test_idx)]"""
    from sklearn.model_selection import GroupKFold
    g = np.asarray(groups)
    return list(GroupKFold(n_splits=k).split(np.zeros(len(g)), groups=g))


def reference_ranges(X: np.ndarray, speeds: np.ndarray, names) -> dict:
    """특징별 p10~p90 (전체)와 target = 구속 상위 1/3 집단의 p25~p75. NaN은 무시."""
    cut = np.percentile(speeds, 100 * 2 / 3)
    top = speeds >= cut
    out = {}
    for i, n in enumerate(names):
        col = X[:, i]
        p = np.nanpercentile(col, [10, 25, 50, 75, 90])
        lo, hi = np.nanpercentile(col[top], [25, 75])
        out[n] = {"p10": float(p[0]), "p25": float(p[1]), "p50": float(p[2]), "p75": float(p[3]), "p90": float(p[4]), "target": [float(lo), float(hi)]}
    return out


def reliability_level(clean: np.ndarray, noisy: np.ndarray, iqr: float) -> str:
    """잡음을 더한 영상 추정값과 깨끗한 값의 평균 절대 차이 ÷ 참조 IQR: <0.25 높음, <0.5 보통, 그 이상 낮음. 절반 넘게 계산 불가이거나 IQR이 0이면 낮음."""
    ok = np.isfinite(clean) & np.isfinite(noisy)
    if ok.mean() < 0.5 or not iqr > 0:
        return "낮음"
    r = float(np.mean(np.abs(noisy[ok] - clean[ok])) / iqr)
    return "높음" if r < 0.25 else "보통" if r < 0.5 else "낮음"


def kbo_release(traj_path=None, pitchers_csv=None) -> dict:
    """2026 KBO 투수별 평균 궤적에서 y=54.5ft 릴리스 위치 분포 (z=높이 m, x=포수 시점 좌우 m, 우투 −/좌투 +).
    구종별 궤적은 투구 수 n으로 가중 평균. 투구 손은 pitchers.csv의 hand."""
    import csv
    base = os.path.join(os.path.dirname(__file__), "..", "public", "data")
    traj = json.load(open(traj_path or os.path.join(base, "traj.json")))
    hand = {r["pid"]: r["hand"] for r in csv.DictReader(open(pitchers_csv or os.path.join(base, "pitchers.csv"), encoding="utf-8"))}
    FT = 0.3048
    rel = {"L": [], "R": []}
    for pid, p in traj["p"].items():
        h = hand.get(pid)
        if h not in rel:
            continue
        tot, sx, sz = 0.0, 0.0, 0.0
        for arr in p["m"].values():
            n, (x0, y0, z0, vx, vy, vz, ax, ay, az) = arr[0], arr[1:10]
            a, b, c = ay / 2, vy, y0 - 54.5
            disc = b * b - 4 * a * c
            if disc < 0 or a == 0:
                continue
            t0 = (-b - np.sqrt(disc)) / (2 * a)
            tot += n; sx += n * (x0 + vx * t0 + ax * t0 * t0 / 2); sz += n * (z0 + vz * t0 + az * t0 * t0 / 2)
        if tot > 0:
            rel[h].append((sx / tot * FT, sz / tot * FT))
    out = {}
    for h, v in rel.items():
        v = np.array(v)
        q = lambda col: {f"p{p}": round(float(np.percentile(col, p)), 3) for p in (10, 25, 50, 75, 90)}
        out[h] = {"z": q(v[:, 1]), "x": q(v[:, 0]), "n": int(len(v))}
    return out


# ---- 모델 후보 ----
def make_model(name: str, params=None):
    from sklearn.pipeline import Pipeline
    from sklearn.impute import SimpleImputer
    from sklearn.preprocessing import StandardScaler
    from sklearn.linear_model import RidgeCV
    from sklearn.ensemble import ExtraTreesRegressor
    from sklearn.neural_network import MLPRegressor
    m = {
        "ridge": lambda: RidgeCV(alphas=np.logspace(-2, 3, 20)),
        "extratrees": lambda: ExtraTreesRegressor(n_estimators=200, min_samples_leaf=4, max_features=0.7, random_state=0, n_jobs=-1),
        "xgboost": lambda: __import__("xgboost").XGBRegressor(n_estimators=250, max_depth=3, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8, min_child_weight=3, random_state=0, n_jobs=4),
        "catboost": lambda: __import__("catboost").CatBoostRegressor(iterations=400, depth=4, learning_rate=0.05, l2_leaf_reg=5, random_seed=0, verbose=0, thread_count=4),
        "mlp": lambda: MLPRegressor(hidden_layer_sizes=(32, 16), alpha=1e-2, max_iter=3000, random_state=0),
    }[name]()
    pipe = Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler()), ("m", m)])
    if params:
        pipe.set_params(**{f"m__{k}": v for k, v in params.items()})
    return pipe


def _r(a, nd=5):
    return np.round(np.asarray(a, float), nd).tolist()


def export_model(name: str, pipe, features) -> dict:
    """JS가 그대로 읽을 수 있는 모델 JSON. 입력은 원래 특징값(NaN 가능) → 중앙값 대체 → 표준화 → 모델."""
    imp, sc, m = pipe.named_steps["imp"], pipe.named_steps["sc"], pipe.named_steps["m"]
    ex = {"name": name, "features": list(features), "impute": imp.statistics_.tolist(), "mean": sc.mean_.tolist(), "std": sc.scale_.tolist()}   # 전체 정밀도: 반올림하면 학습 점 근처에서 트리 분기가 뒤집힘
    if name == "ridge":
        ex.update(kind="linear", coef=_r(m.coef_, 6), intercept=float(m.intercept_))
    elif name == "mlp":
        ex.update(kind="mlp", layers=[{"W": _r(W, 6), "b": _r(b, 6)} for W, b in zip(m.coefs_, m.intercepts_)])
    elif name == "extratrees":
        trees = []
        for e in m.estimators_:
            t = e.tree_
            trees.append({"f": t.feature.tolist(), "t": _r(t.threshold, 6), "l": t.children_left.tolist(), "r": t.children_right.tolist(), "v": _r(t.value[:, 0, 0], 3)})
        ex.update(kind="trees", mode="mean", strict=False, trees=trees)
    elif name == "xgboost":
        trees = []
        for s in m.get_booster().get_dump(dump_format="json"):
            f, th, l, r, v = [], [], [], [], []

            def walk(n):
                i = len(f); f.append(-1); th.append(0.0); l.append(-1); r.append(-1); v.append(0.0)
                if "leaf" in n:
                    v[i] = float(n["leaf"]); return i
                kids = {c["nodeid"]: c for c in n["children"]}
                f[i] = int(n["split"][1:]); th[i] = float(n["split_condition"])
                l[i] = walk(kids[n["yes"]]); r[i] = walk(kids[n["no"]])
                return i
            walk(json.loads(s))
            trees.append({"f": f, "t": [float(np.float32(x)) for x in th], "l": l, "r": r, "v": _r(v, 6)})   # XGBoost 기준값은 32비트 실수
        ex.update(kind="trees", mode="sum", strict=True, base=0.0, trees=trees)
        Xp = _synthetic_probe(len(features), ex)
        raw = pipe.predict(Xp)
        ex["base"] = float(np.median(raw - predict_export(ex, Xp)))
    elif name == "catboost":
        import tempfile
        p = os.path.join(tempfile.mkdtemp(), "m.json")
        m.save_model(p, format="json")
        j = json.load(open(p))
        sc_, bi = j["scale_and_bias"]
        ex.update(kind="oblivious", scale=float(sc_), bias=float(bi[0]),
                  trees=[{"s": [[int(s["float_feature_index"]), round(float(s["border"]), 6)] for s in t["splits"]], "v": _r(t["leaf_values"], 5)} for t in j["oblivious_trees"]])
    else:
        raise ValueError(name)
    return ex


def _synthetic_probe(nf, ex, n=64):
    """XGBoost 기준 점수(base) 계산용: 표준화 공간의 임의 점을 원래 값으로 되돌린 입력"""
    z = np.random.default_rng(0).normal(size=(n, nf))
    return z * np.array(ex["std"]) + np.array(ex["mean"])


def predict_export(ex: dict, X: np.ndarray) -> np.ndarray:
    """내보낸 모델로 예측 (브라우저 src/lib/formModel.js와 같은 계산). X: [n, 특징수], NaN은 중앙값으로 대체."""
    X = np.array(X, float)
    for j in range(X.shape[1]):
        X[np.isnan(X[:, j]), j] = ex["impute"][j]
    Z = (X - np.array(ex["mean"])) / np.array(ex["std"])
    k = ex["kind"]
    if k == "linear":
        return Z @ np.array(ex["coef"]) + ex["intercept"]
    if k == "mlp":
        h = Z
        for i, L in enumerate(ex["layers"]):
            h = h @ np.array(L["W"]) + np.array(L["b"])
            if i < len(ex["layers"]) - 1:
                h = np.maximum(h, 0)
        return h[:, 0]
    out = np.zeros(len(Z))
    if k == "trees":
        for tr in ex["trees"]:
            f, t, l, r, v = tr["f"], tr["t"], tr["l"], tr["r"], tr["v"]
            for i in range(len(Z)):
                n = 0
                while f[n] >= 0:
                    z32 = np.float32(Z[i, f[n]])           # 트리 라이브러리는 입력을 32비트 실수로 비교한다
                    go_left = z32 < np.float32(t[n]) if ex["strict"] else float(z32) <= t[n]
                    n = l[n] if go_left else r[n]
                out[i] += v[n]
        return out / len(ex["trees"]) if ex["mode"] == "mean" else out + ex["base"]
    if k == "oblivious":
        for tr in ex["trees"]:
            idx = np.zeros(len(Z), int)
            for b, (f, border) in enumerate(tr["s"]):
                idx |= (Z[:, f] > border).astype(int) << b
            out += np.array(tr["v"])[idx]
        return out * ex["scale"] + ex["bias"]
    raise ValueError(k)


def _vec(ft: dict) -> list:
    return [np.nan if ft[k] is None else ft[k] for k in FEATURE_KEYS]


def build_features(df, sig, reps: int = REPS, seed: int = 0, cache=None):
    """깨끗한 360Hz 특징 Xc[N,12]와 시점별 영상 모사 특징 Xn[view][reps*N,12] (30fps로 줄인 뒤 시점별 잡음). 행 순서: 복제 r, 투구 i → r*N+i."""
    if cache and os.path.exists(cache):
        z = np.load(cache)
        if z["N"] == len(df):
            return z["Xc"], {v: z["Xn_" + v] for v in VIEWS}
    rng = np.random.default_rng(seed)
    Xc, Xn = [], {v: [] for v in VIEWS}
    keys = list(df.session_pitch)
    for k in keys:
        j, hand = joints3d(sig[k]); a = align(j, hand); t = sig[k]["t"]
        Xc.append(_vec(features3d(a, t)))
    for v in VIEWS:
        for r in range(reps):
            for k in keys:
                j, hand = joints3d(sig[k]); a = align(j, hand); t = sig[k]["t"]
                off = int(rng.integers(0, VIDEO_STEP))
                s = {n: x[off::VIDEO_STEP] for n, x in a.items()}
                Xn[v].append(_vec(features3d(add_estimation_noise(s, v, rng), t[off::VIDEO_STEP])))
    Xc = np.array(Xc, float); Xn = {v: np.array(x, float) for v, x in Xn.items()}
    if cache:
        np.savez(cache, N=len(df), Xc=Xc, **{"Xn_" + v: x for v, x in Xn.items()})
    return Xc, Xn


def cv_compare(X, y, groups, reps: int, names=MODEL_NAMES, k: int = 5, clean_X=None, params=None):
    """X: [reps*N,12] 학습·평가 입력, y/groups: [N]. 선수 단위 k분할. 반환 {name:{rmse,mae}} (평가는 잡음 입힌 입력, 투구 단위로 복제 평균하지 않음)"""
    N = len(y)
    res = {}
    for name in names:
        err = []
        for tr, te in group_folds(groups, k):
            tr_rows = np.concatenate([tr + r * N for r in range(reps)]); te_rows = np.concatenate([te + r * N for r in range(reps)])
            m = make_model(name, (params or {}).get(name)).fit(X[tr_rows], np.tile(y, reps)[tr_rows])
            err.append(m.predict(X[te_rows]) - np.tile(y, reps)[te_rows])
        e = np.concatenate(err)
        res[name] = {"rmse": float(np.sqrt(np.mean(e ** 2))), "mae": float(np.mean(np.abs(e)))}
    return res


def cv_importance(name, X, y, groups, reps, k: int = 5, repeats: int = 10, params=None):
    """평가 쪽 자료에서 순열 중요도 (RMSE 증가량 평균, 0 미만은 0). 반환 [12]"""
    from sklearn.inspection import permutation_importance
    N = len(y); imp = np.zeros(X.shape[1])
    for tr, te in group_folds(groups, k):
        tr_rows = np.concatenate([tr + r * N for r in range(reps)]); te_rows = np.concatenate([te + r * N for r in range(reps)])
        m = make_model(name, params).fit(X[tr_rows], np.tile(y, reps)[tr_rows])
        pi = permutation_importance(m, X[te_rows], np.tile(y, reps)[te_rows], n_repeats=repeats, random_state=0, scoring="neg_root_mean_squared_error")
        imp += np.clip(pi.importances_mean, 0, None)
    return imp / k


def main(out_ref=None, out_model=None, out_results=None, tuned=None, reps=REPS, cache_name="form_feats.npz"):
    here = os.path.dirname(__file__)
    out_ref = out_ref or os.path.join(here, "..", "public", "data", "form_ref.json")
    out_model = out_model or os.path.join(here, "..", "public", "data", "form_model.json")
    out_results = out_results or os.path.join(here, "form_models.json")
    t0 = time.time()
    df, sig = load_obp()
    df = df[df.pitch_speed_mph.notna()].reset_index(drop=True)
    y = df.pitch_speed_mph.to_numpy(float); groups = df.user.to_numpy()
    print(f"투구 {len(df)}개, 선수 {df.user.nunique()}명", flush=True)
    Xc, Xn = build_features(df, sig, reps=reps, cache=os.path.join(here, "raw", "obp", cache_name))
    print(f"특징 계산 {time.time() - t0:.0f}초", flush=True)
    ref = reference_ranges(Xc, y, FEATURE_KEYS)
    models, best, clean_rmse, degrade, importance, exported, rel = {}, {}, {}, {}, np.zeros(len(FEATURE_KEYS)), {}, {k: {} for k in FEATURE_KEYS}
    for v in VIEWS:
        if tuned:       # 하이퍼파라미터까지 튜닝한 결과(form_tune.py): 안쪽 탐색은 선수 단위, 바깥 평가는 중첩 교차검증
            models[v] = tuned[v]["models"]; prm = tuned[v]["params"]
        else:
            models[v] = cv_compare(Xn[v], y, groups, reps); prm = {}
        best[v] = min(models[v], key=lambda n: models[v][n]["rmse"])
        degrade[v] = models[v][best[v]]["rmse"]
        clean_rmse[v] = cv_compare(Xc, y, groups, 1, names=[best[v]], params=prm)[best[v]]["rmse"]
        imp = cv_importance(best[v], Xn[v], y, groups, reps, params=prm.get(best[v]))
        importance += imp / max(imp.sum(), 1e-12)
        final = make_model(best[v], prm.get(best[v])).fit(Xn[v], np.tile(y, reps))
        exported[v] = export_model(best[v], final, FEATURE_KEYS)
        exported[v]["rmse"] = round(degrade[v], 3)       # 교차검증 RMSE(mph): 화면에 "±" 오차로 보여 줌
        for i, k in enumerate(FEATURE_KEYS):
            iqr = ref[k]["p75"] - ref[k]["p25"]
            rel[k][v] = reliability_level(np.tile(Xc[:, i], reps), Xn[v][:, i], iqr)
        print(f"[{v}] " + ", ".join(f"{n} {r['rmse']:.2f}" for n, r in models[v].items()) + f" → 최고 {best[v]} (깨끗한 입력 {clean_rmse[v]:.2f}) {time.time() - t0:.0f}초", flush=True)
    importance /= importance.sum()
    for i, k in enumerate(FEATURE_KEYS):
        ref[k]["importance"] = round(float(importance[i]), 4)
    cut = float(np.percentile(y, 100 * 2 / 3))
    meta = {"n_trials": int(len(df)), "n_athletes": int(df.user.nunique()), "license": LICENSE, "source": SOURCE,
            "playing_levels": {k: int(v) for k, v in df.playing_level.value_counts().items()},
            "noise": {"screen_m": NOISE["screen_m"], "depth_m": NOISE["depth_m"], "fast_x": NOISE["fast_x"]},
            "models": models, "best": best, "clean_rmse": clean_rmse, "degrade": degrade, "top_tercile_cut_mph": round(cut, 1), "reps": reps, "tuned": bool(tuned), "cv": "GroupKFold(선수) 5분할"}
    def rd(o):
        return {k: rd(x) for k, x in o.items()} if isinstance(o, dict) else (round(o, 4) if isinstance(o, float) else o)
    out = {"meta": rd(meta), "ref": {k: {kk: (rd(vv) if not isinstance(vv, list) else [round(z, 4) for z in vv]) for kk, vv in r.items()} for k, r in ref.items()}, "reliability": rel, "kbo_release": kbo_release()}
    json.dump(out, open(out_ref, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(exported, open(out_model, "w"), separators=(",", ":"))
    json.dump({"models": models, "best": best, "clean_rmse": clean_rmse, "reliability": rel, "importance": dict(zip(FEATURE_KEYS, importance.round(4).tolist()))}, open(out_results, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"완료 {time.time() - t0:.0f}초 · form_ref.json {os.path.getsize(out_ref) / 1e3:.0f}KB · form_model.json {os.path.getsize(out_model) / 1e6:.2f}MB", flush=True)


def write_model_fixture(path=None) -> None:
    """파이썬↔자바스크립트 모델 계산 일치 시험 자료: 다섯 종류 모델을 작게 학습해 내보낸 JSON과 입력(NaN은 null)·예측"""
    path = path or os.path.join(os.path.dirname(__file__), "..", "tests", "fixtures", "form_model_parity.json")
    rng = np.random.default_rng(7)
    X = rng.normal(size=(150, 4)); X[::13, 1] = np.nan
    y = 70 + 3 * X[:, 0] - 2 * np.nan_to_num(X[:, 1]) + rng.normal(size=150)
    out = []
    for name in MODEL_NAMES:
        ex = export_model(name, make_model(name).fit(X, y), ["a", "b", "c", "d"])
        out.append({"model": ex, "X": [[None if np.isnan(v) else float(v) for v in r] for r in X[:25]], "y": [float(v) for v in predict_export(ex, X[:25])]})
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(out, open(path, "w"), separators=(",", ":"))


if __name__ == "__main__":
    main()
