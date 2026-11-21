/* 타격 자세 3D 특징 계산 — 순수 함수. ml/hit_ref.py와 같은 알고리즘이다(tests/hit.test.js가 tests/fixtures/hit_parity.json으로 일치를 검증한다).
 * 좌표는 form.js와 같다(맞춘 좌표계 X = 투수 방향, Y = 위, Z = X×Y). 앞쪽(투수 쪽) = 우타자의 왼쪽(l), 좌타자는 align()이 좌우를 뒤집어 우타자처럼 만든다. */
import { JOINTS, MIN_CLIP_S, MIN_ROT_DPS, PEAK_PAD_S, prep, speed, argmax, sub, ang, wrap, unwrap, gradient1 } from "./form.js";

export const HIT_KEYS = ["stride_torso", "trunk_lean_deg", "knee_fp_deg", "knee_ct_deg", "hip_shoulder_sep_deg", "pelvis_rot_deg", "trunk_rot_deg",
  "trunk_rot_lag_ms", "pelvis_trunk_gap_ms", "trunk_hands_gap_ms", "fp_to_ct_ms", "hands_reach_torso"];
export const CT_SHIFT_S = 0.017, FP_SHIFT_HIT_S = 0.095;   // 엉덩이 기준 손 속도 정점 + 0.017초 = 타격 순간, 앞발목 보폭 최대 + 0.095초 = 착지 (OBP 실측 비교로 정한 값, ml/hit_ref.py와 같음)
const DEG = 180 / Math.PI;

const handsOf = S => S.lwri.map((p, k) => [0, 1, 2].map(c => (p[c] + S.rwri[k][c]) / 2));

/** {lift, fp, br}: 앞발 들기 최고점·앞발 착지·타격 순간(br 자리에 둔다: 투구와 같은 화면 코드를 쓰기 위해)의 프레임 인덱스(원래 frames 기준, 못 찾으면 null) */
export function findEventsHit(frames) {
  const none = { lift: null, fp: null, br: null };
  const { idx, t, S, L } = prep(frames);
  if (t.length < 5 || t[t.length - 1] - t[0] < MIN_CLIP_S || !(L > 1e-6)) return none;
  const pk = argmax(speed(handsOf(S), t, L));
  let ct = 0; { const target = t[pk] + CT_SHIFT_S; for (let i = 1; i < t.length; i++) if (Math.abs(t[i] - target) < Math.abs(t[ct] - target)) ct = i; }
  const fx = i => S.lank[i][0] - (S.lhip[i][0] + S.rhip[i][0]) / 2, rel = i => S.lank[i][1] - (S.lhip[i][1] + S.rhip[i][1]) / 2;
  let pks = 0; for (let i = 1; i <= ct; i++) if (fx(i) > fx(pks)) pks = i;      // 앞발목이 엉덩이 앞으로 가장 멀리 뻗은 순간
  let lift = 0; for (let i = 1; i <= pks; i++) if (rel(i) > rel(lift)) lift = i;
  let fi = 0; { const target = t[pks] + FP_SHIFT_HIT_S; for (let i = 1; i < t.length; i++) if (Math.abs(t[i] - target) < Math.abs(t[fi] - target)) fi = i; }
  const fp = pks < fi && fi < ct ? fi : null;
  return { lift: idx[lift], fp: fp === null ? null : idx[fp], br: idx[ct] };
}

/** 12개 3D 특징 (키는 HIT_KEYS). 계산할 수 없는 것은 null. 길이는 몸통 길이 단위, 각도는 도, 시간은 ms */
export function featuresHit(frames) {
  const out = Object.fromEntries(HIT_KEYS.map(k => [k, null]));
  const ev = findEventsHit(frames);
  if (ev.br === null) return out;
  const { idx, t, S, L } = prep(frames);
  const at = i => idx.indexOf(i), lift = at(ev.lift), fp = ev.fp === null ? null : at(ev.fp), ct = at(ev.br);
  const mid = (a, b, k) => [0, 1, 2].map(c => (S[a][k][c] + S[b][k][c]) / 2);
  const hands = handsOf(S);
  out.trunk_lean_deg = ang(sub(mid("lsho", "rsho", ct), mid("lhip", "rhip", ct)), [0, 1, 0]);
  out.knee_ct_deg = ang(sub(S.lhip[ct], S.lkne[ct]), sub(S.lank[ct], S.lkne[ct]));
  out.hands_reach_torso = (hands[ct][0] - mid("lhip", "rhip", ct)[0]) / L;
  const line = (a, b) => t.map((_, k) => Math.atan2(S[a][k][2] - S[b][k][2], S[a][k][0] - S[b][k][0]));
  const ths = line("rsho", "lsho"), thp = line("rhip", "lhip");
  let sep = 0; for (let i = lift; i <= ct; i++) sep = Math.max(sep, Math.abs(wrap(ths[i] - thp[i])));
  out.hip_shoulder_sep_deg = sep * DEG;
  if (fp !== null) {
    out.stride_torso = ((S.lank[fp][0] - S.rank[fp][0]) - (S.lank[0][0] - S.rank[0][0])) / L;
    out.knee_fp_deg = ang(sub(S.lhip[fp], S.lkne[fp]), sub(S.lank[fp], S.lkne[fp]));
    out.fp_to_ct_ms = (t[ct] - t[fp]) * 1000;
    out.pelvis_rot_deg = Math.abs(wrap(thp[ct] - thp[fp]) * DEG);
    out.trunk_rot_deg = Math.abs(wrap(ths[ct] - ths[fp]) * DEG);
    const w = []; t.forEach((tt, i) => { if (tt >= t[fp] - PEAK_PAD_S && tt <= t[ct] + PEAK_PAD_S) w.push(i); });
    const om = th => gradient1(unwrap(th), t).map(v => Math.abs(v * DEG));
    const ws = om(ths), wp = om(thp);
    if (w.length && Math.max(...w.map(i => ws[i])) >= MIN_ROT_DPS && Math.max(...w.map(i => wp[i])) >= MIN_ROT_DPS) {
      let ts = w[0], tp = w[0]; for (const i of w) { if (ws[i] > ws[ts]) ts = i; if (wp[i] > wp[tp]) tp = i; }
      out.trunk_rot_lag_ms = (t[ts] - t[fp]) * 1000;
      out.pelvis_trunk_gap_ms = (t[ts] - t[tp]) * 1000;
      out.trunk_hands_gap_ms = (t[ct] - t[ts]) * 1000;
    }
  }
  return out;
}
