"""타격 자세 학습 파이프라인 시험: python3 -m pytest ml/test_hit_ref.py"""
import json, os, sys
import numpy as np
import pytest
sys.path.insert(0, os.path.dirname(__file__))
import hit_ref as H

pytestmark = pytest.mark.skipif(not os.path.exists(H.LANDMARKS), reason="OBP 타격 자료(ml/raw/obp)가 없습니다")


@pytest.fixture(scope="module")
def data():
    return H.load_hit()


def test_load_hit_shapes(data):
    df, sig = data
    assert len(df) >= 600 and df.user.nunique() >= 90 and df.bat_speed.notna().all()
    k = df.session_swing[0]; e = sig[k]
    assert set(e["xyz"]) == set(H.RAW.values()) and e["xyz"]["lsjc"].shape[1] == 3 and e["events"]["ct"] > e["events"]["fp"]


def test_alignment_puts_lead_foot_toward_pitcher_for_both_sides(data):
    df, sig = data
    for side in ("R", "L"):
        ks = df[df.side == side].session_swing.iloc[:15]
        gaps = []
        for k in ks:
            a = H.align(*H.joints_hit(sig[k], side)); ev = H.find_events_hit(a, sig[k]["t"])
            if ev["fp"] is not None:
                gaps.append(a["lank"][ev["fp"], 0] - a["rank"][ev["fp"], 0])
        assert np.median(gaps) > 0.2, side      # 앞발(lank)이 뒷발보다 투수 쪽(+X)


def test_contact_time_matches_obp_truth(data):
    df, sig = data; err = []
    for k, s in list(zip(df.session_swing, df.side))[::10]:
        a = H.align(*H.joints_hit(sig[k], s)); t = sig[k]["t"]; ev = H.find_events_hit(a, t)
        if ev["ct"] is not None:
            err.append(t[ev["ct"]] - sig[k]["events"]["ct"])
    assert abs(np.median(err)) < 0.02 and np.percentile(np.abs(err), 75) < 0.03


def test_features_have_keys_and_short_clip_is_empty(data):
    df, sig = data; k = df.session_swing[3]
    a = H.align(*H.joints_hit(sig[k], df.side[3])); t = sig[k]["t"]
    f = H.features_hit(a, t)
    assert list(f) == H.HIT_KEYS and sum(v is not None for v in f.values()) >= 9
    assert all(v is None for v in H.features_hit({n: x[:50] for n, x in a.items()}, t[:50]).values())


def test_exported_reference_schema():
    p = os.path.join(H.HERE, "..", "public", "data", "hit_ref.json")
    if not os.path.exists(p):
        pytest.skip("hit_ref.json 없음")
    r = json.load(open(p, encoding="utf-8"))
    assert set(r["ref"]) == set(H.HIT_KEYS) and set(r["reliability"]) == set(H.HIT_KEYS)
    assert r["meta"]["n_swings"] >= 600 and r["meta"]["speed_sd"] > 0 and r["meta"]["license"] == "CC BY-NC-SA 4.0"
    for v in H.VIEWS:
        b = r["meta"]["best"][v]
        assert r["meta"]["models"][v][b]["rmse"] == min(x["rmse"] for x in r["meta"]["models"][v].values())
    assert abs(sum(x["importance"] for x in r["ref"].values()) - 1) < 1e-3
