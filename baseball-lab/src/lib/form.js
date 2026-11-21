/* 투구 폼 3D 특징 계산 — 순수 함수 (영상·DOM 없음).
 * ml/form_ref.py와 같은 알고리즘이다(tests/form.test.js가 tests/fixtures/form_parity.json으로 일치를 검증한다).
 * 맞춘 좌표계: X = 투구 방향(홈 쪽 +), Y = 위(+), Z = X×Y(오른쪽 +), 단위 m. 관절 이름은 몸의 좌우(l/r). */

export const JOINTS = ["lsho", "rsho", "lelb", "relb", "lwri", "rwri", "lhip", "rhip", "lkne", "rkne", "lank", "rank"];
export const MP_INDEX = { lsho: 11, rsho: 12, lelb: 13, relb: 14, lwri: 15, rwri: 16, lhip: 23, rhip: 24, lkne: 25, rkne: 26, lank: 27, rank: 28 };
export const FEATURE_KEYS = ["stride_torso", "trunk_lean_deg", "knee_fp_deg", "knee_br_deg", "arm_angle_deg", "elbow_h_fp", "release_h_torso",
  "hip_shoulder_sep_deg", "trunk_rot_lag_ms", "pelvis_trunk_gap_ms", "trunk_arm_gap_ms", "fp_to_br_ms"];
export const SMOOTH_S = 0.1, MIN_CLIP_S = 0.8, FP_HEIGHT = 0.08, MIN_ROT_DPS = 30, PEAK_PAD_S = 0.05;

const swap = n => (n[0] === "l" ? "r" : "l") + n.slice(1);
const DEG = 180 / Math.PI;

/** MediaPipe 월드 좌표(33개, y 아래·z 카메라 쪽 +) → 12관절 프레임 (y·z를 뒤집어 y 위 +인 오른손 좌표로). 정렬(align) 전. */
export function toFrame(t, world) {
  const j = {};
  for (const n of JOINTS) { const p = world[MP_INDEX[n]]; j[n] = { x: p.x, y: -p.y, z: -p.z, v: p.visibility ?? 1 }; }
  return { t, j };
}

/** 좌표를 "수직축 Y + 투구 방향 +X"로 맞춘다. 좌투는 몸 좌우 이름을 바꾸고 Z를 뒤집어 우투와 같은 규칙으로 통일.
 *  투구 방향 = 두 발의 수평 거리가 가장 벌어진 프레임에서 뒷발(rank)→앞발(lank) 방향. */
export function align(frames, hand) {
  const mir = frames.map(f => (!f.j ? f : hand === "L"
    ? { t: f.t, j: Object.fromEntries(JOINTS.map(n => { const p = f.j[swap(n)]; return [n, { x: p.x, y: p.y, z: -p.z, v: p.v }]; })) }
    : f));
  let best = -1, bi = -1;
  mir.forEach((f, i) => { if (!f.j) return; const h = Math.hypot(f.j.lank.x - f.j.rank.x, f.j.lank.z - f.j.rank.z); if (h > best) { best = h; bi = i; } });
  if (bi < 0 || best < 1e-6) return mir;
  const d = mir[bi].j, th = Math.atan2(d.lank.z - d.rank.z, d.lank.x - d.rank.x), c = Math.cos(th), s = Math.sin(th);
  return mir.map(f => (!f.j ? f : { t: f.t, j: Object.fromEntries(JOINTS.map(n => { const p = f.j[n]; return [n, { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c, v: p.v }]; })) }));
}

// ---- 수치 도우미 (numpy와 같은 정의) ----
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const norm = a => Math.hypot(a[0], a[1], a[2]);
export const ang = (a, b) => { const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (norm(a) * norm(b)); return Math.acos(Math.max(-1, Math.min(1, c))) * DEG; };
export const wrap = x => ((((x + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

/** 시각 t 기준 이동평균 (창 = |t_j - t_i| <= win/2) */
export function smooth(P, t, win = SMOOTH_S) {
  return t.map((ti) => { const s = [0, 0, 0]; let n = 0; for (let j = 0; j < t.length; j++) if (Math.abs(t[j] - ti) <= win / 2 + 1e-12) { s[0] += P[j][0]; s[1] += P[j][1]; s[2] += P[j][2]; n++; } return [s[0] / n, s[1] / n, s[2] / n]; });
}
/** numpy.gradient(f, t) — 간격이 일정하지 않아도 된다 (가장자리는 1차) */
function gradient(f, t) {
  const n = t.length, g = new Array(n);
  const one = (a, b, k) => (f[b][k] - f[a][k]) / (t[b] - t[a]);
  for (let i = 0; i < n; i++) {
    g[i] = [0, 1, 2].map(k => {
      if (i === 0) return one(0, 1, k);
      if (i === n - 1) return one(n - 2, n - 1, k);
      const d1 = t[i] - t[i - 1], d2 = t[i + 1] - t[i];
      return (-d2 / (d1 * (d1 + d2))) * f[i - 1][k] + ((d2 - d1) / (d1 * d2)) * f[i][k] + (d1 / (d2 * (d1 + d2))) * f[i + 1][k];
    });
  }
  return g;
}
export const gradient1 = (f, t) => { const n = t.length; return f.map((_, i) => { if (i === 0) return (f[1] - f[0]) / (t[1] - t[0]); if (i === n - 1) return (f[n - 1] - f[n - 2]) / (t[n - 1] - t[n - 2]);
  const d1 = t[i] - t[i - 1], d2 = t[i + 1] - t[i]; return (-d2 / (d1 * (d1 + d2))) * f[i - 1] + ((d2 - d1) / (d1 * d2)) * f[i] + (d1 / (d2 * (d1 + d2))) * f[i + 1]; }); };
export const unwrap = th => { const out = [th[0]]; let off = 0; for (let i = 1; i < th.length; i++) { const dp = th[i] - th[i - 1]; let m = wrap(dp); if (m === -Math.PI && dp > 0) m = Math.PI; if (Math.abs(dp) >= Math.PI) off += m - dp; out.push(th[i] + off); } return out; };

/** 유효 프레임만 모아 {idx(원래 인덱스), t, S(이동평균한 관절), L(몸통 길이)} */
export function prep(frames) {
  const idx = []; frames.forEach((f, i) => { if (f.j) idx.push(i); });
  const t = idx.map(i => frames[i].t);
  const S = Object.fromEntries(JOINTS.map(n => [n, smooth(idx.map(i => { const p = frames[i].j[n]; return [p.x, p.y, p.z]; }), t)]));
  const L = t.length ? t.map((_, k) => norm(sub([0, 1, 2].map(c => (S.lsho[k][c] + S.rsho[k][c]) / 2), [0, 1, 2].map(c => (S.lhip[k][c] + S.rhip[k][c]) / 2)))).reduce((a, b) => a + b, 0) / t.length : 0;
  return { idx, t, S, L };
}
export const speed = (P, t, L) => gradient(P, t).map(g => norm(g) / L);
export const argmax = a => a.reduce((m, v, i) => (v > a[m] ? i : m), 0);

/** {lift, fp, br}: 발 들기 최고점·앞발 착지·릴리스의 프레임 인덱스(원래 frames 기준, 못 찾으면 null) */
export function findEvents(frames) {
  const none = { lift: null, fp: null, br: null };
  const { idx, t, S, L } = prep(frames);
  if (t.length < 5 || t[t.length - 1] - t[0] < MIN_CLIP_S || !(L > 1e-6)) return none;
  const br = argmax(speed(S.rwri, t, L));
  const ly = S.lank.map(p => p[1]);
  let lift = 0; for (let i = 1; i <= br; i++) if (ly[i] > ly[lift]) lift = i;
  const lim = Math.min(...ly) + FP_HEIGHT * L;
  let fp = null; for (let i = lift + 1; i < t.length; i++) if (ly[i] <= lim) { fp = i; break; }
  if (fp !== null && fp >= br) fp = null;   // 착지는 릴리스보다 먼저여야 한다(저각도 영상에서 착지가 릴리스 뒤로 잡힌 적 있음)
  return { lift: idx[lift], fp: fp === null ? null : idx[fp], br: idx[br] };
}

/** 12개 3D 특징 (키는 FEATURE_KEYS). 계산할 수 없는 것은 null. 길이는 몸통 길이 단위, 각도는 도, 시간은 ms */
export function features3d(frames) {
  const out = Object.fromEntries(FEATURE_KEYS.map(k => [k, null]));
  const ev = findEvents(frames);
  if (ev.br === null) return out;
  const { idx, t, S, L } = prep(frames);
  const at = i => idx.indexOf(i), lift = at(ev.lift), fp = ev.fp === null ? null : at(ev.fp), br = at(ev.br);
  const mid = (a, b, k) => [0, 1, 2].map(c => (S[a][k][c] + S[b][k][c]) / 2);
  out.trunk_lean_deg = ang(sub(mid("lsho", "rsho", br), mid("lhip", "rhip", br)), [0, 1, 0]);
  out.knee_br_deg = ang(sub(S.lhip[br], S.lkne[br]), sub(S.lank[br], S.lkne[br]));
  out.arm_angle_deg = ang(sub(S.relb[br], S.rsho[br]), [0, -1, 0]);
  const ground = Math.min(...S.lank.map(p => p[1]), ...S.rank.map(p => p[1]));
  out.release_h_torso = (S.rwri[br][1] - ground) / L;
  if (fp !== null) {
    out.stride_torso = (S.lank[fp][0] - S.rank[fp][0]) / L;
    out.knee_fp_deg = ang(sub(S.lhip[fp], S.lkne[fp]), sub(S.lank[fp], S.lkne[fp]));
    out.elbow_h_fp = (S.relb[fp][1] - S.rsho[fp][1]) / L;
    out.fp_to_br_ms = (t[br] - t[fp]) * 1000;
  }
  const line = (a, b) => t.map((_, k) => Math.atan2(S[a][k][2] - S[b][k][2], S[a][k][0] - S[b][k][0]));
  const ths = line("rsho", "lsho"), thp = line("rhip", "lhip");
  let sep = 0; for (let i = lift; i <= br; i++) sep = Math.max(sep, Math.abs(wrap(ths[i] - thp[i])));
  out.hip_shoulder_sep_deg = sep * DEG;
  if (fp !== null) {
    const w = []; t.forEach((tt, i) => { if (tt >= t[fp] - PEAK_PAD_S && tt <= t[br] + PEAK_PAD_S) w.push(i); });
    const om = th => gradient1(unwrap(th), t).map(v => Math.abs(v * DEG));
    const ws = om(ths), wp = om(thp);
    if (w.length && Math.max(...w.map(i => ws[i])) >= MIN_ROT_DPS && Math.max(...w.map(i => wp[i])) >= MIN_ROT_DPS) {
      let ts = w[0], tp = w[0]; for (const i of w) { if (ws[i] > ws[ts]) ts = i; if (wp[i] > wp[tp]) tp = i; }
      out.trunk_rot_lag_ms = (t[ts] - t[fp]) * 1000;
      out.pelvis_trunk_gap_ms = (t[ts] - t[tp]) * 1000;
      out.trunk_arm_gap_ms = (t[br] - t[ts]) * 1000;
    }
  }
  return out;
}

/** 영상 추정 신뢰도: 유효 프레임 비율과 관절 신뢰도(v) 평균 */
export function confidence(frames /*, events */) {
  const ok = frames.filter(f => f.j);
  if (!frames.length || !ok.length) return "낮음";
  const ratio = ok.length / frames.length, v = ok.reduce((s, f) => s + JOINTS.reduce((a, n) => a + f.j[n].v, 0) / JOINTS.length, 0) / ok.length;
  return ratio >= 0.9 && v >= 0.7 ? "높음" : ratio >= 0.7 && v >= 0.5 ? "보통" : "낮음";
}

const LR_PAIRS = [["lsho", "rsho"], ["lelb", "relb"], ["lwri", "rwri"], ["lhip", "rhip"], ["lkne", "rkne"], ["lank", "rank"]];
/** 몸이 돌 때 MediaPipe가 왼쪽·오른쪽 이름을 바꿔 붙이는 프레임을 되돌린다(좌표가 한꺼번에 반대쪽으로 튐).
 *  이전 프레임과의 거리를 어깨·엉덩이·무릎·발목 8개로 재서, 이름을 바꾸는 쪽이 훨씬 가깝고(60% 미만) 그대로일 때 많이 움직였으면(평균 0.12m 초과) 바꾼다.
 *  손목·팔꿈치는 빠르게 움직여 판단에서 뺀다(바꿀 때는 12개 모두 함께 바꾼다). */
const LR_JUDGE = ["lsho", "rsho", "lhip", "rhip", "lkne", "rkne", "lank", "rank"];
export function fixLeftRight(frames) {
  const out = []; let prev = null;
  for (const f of frames) {
    if (!f.j) { out.push(f); continue; }
    let cur = f;
    if (prev) {
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      const swapName = n => { for (const [a, b] of LR_PAIRS) { if (n === a) return b; if (n === b) return a; } return n; };
      const keep = LR_JUDGE.reduce((s, n) => s + dist(prev.j[n], f.j[n]), 0) / LR_JUDGE.length;
      const swap = LR_JUDGE.reduce((s, n) => s + dist(prev.j[n], f.j[swapName(n)]), 0) / LR_JUDGE.length;
      if (keep > 0.12 && swap < 0.6 * keep) { const j = { ...f.j }; for (const [a, b] of LR_PAIRS) { j[a] = f.j[b]; j[b] = f.j[a]; } cur = { ...f, j }; }
    }
    out.push(cur); prev = cur;
  }
  return out;
}

const BONES = [["lsho", "lelb"], ["lelb", "lwri"], ["rsho", "relb"], ["relb", "rwri"], ["lhip", "lkne"], ["lkne", "lank"], ["rhip", "rkne"], ["rkne", "rank"]];
export const BONE_CV_MAX = 0.15;   // 이 값을 넘으면 "낮음": 모의 실험에서 0.13→0.17 사이에 믿을 만한 지표가 12개 중 7개→2개로 무너짐
export const BONE_CV_CAP = 0.10;   // 이 값을 넘으면 최대 "보통"
/** 뼈 길이가 프레임마다 얼마나 흔들리는지(변동계수 평균). 0.15 넘으면 3D 추정이 불안정(ok:false) */
export function boneCheck(frames) {
  const ok = frames.filter(f => f.j);
  if (ok.length < 3) return { ok: false, cv: Infinity };
  const cvs = BONES.map(([a, b]) => { const L = ok.map(f => Math.hypot(f.j[a].x - f.j[b].x, f.j[a].y - f.j[b].y, f.j[a].z - f.j[b].z)); const m = L.reduce((s, v) => s + v, 0) / L.length; return Math.sqrt(L.reduce((s, v) => s + (v - m) ** 2, 0) / L.length) / m; });
  const cv = cvs.reduce((s, v) => s + v, 0) / cvs.length;
  return { ok: cv <= BONE_CV_MAX, cv };
}
