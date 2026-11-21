/* 영상 3D에서 "관절을 얼마나, 어떤 순서로 쓰는가"를 정리 — 각도 시계열, 관절 사용 표, 몸 쓰는 순서. 맞춘 좌표의 프레임(j:null 가능)을 받는다.
 * 모두 영상 추정(3D)이라 참고용이다. 숫자는 정확한 측정값이 아니다. */
const DEG = 180 / Math.PI;
const vec = (a, b) => [b.x - a.x, b.y - a.y, b.z - a.z];
const angle = (a, b, c) => {
  const u = vec(b, a), v = vec(b, c), d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2], m = Math.hypot(...u) * Math.hypot(...v);
  return Math.acos(Math.max(-1, Math.min(1, d / m))) * DEG;
};
const yaw = (r, l) => Math.atan2(r.z - l.z, r.x - l.x);
const unwrap = a => { const o = [a[0]]; let off = 0; for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1]; if (d > Math.PI) off -= 2 * Math.PI; else if (d < -Math.PI) off += 2 * Math.PI; o.push(a[i] + off); } return o; };
const smooth3 = a => a.map((_, i) => { const s = a.slice(Math.max(0, i - 1), i + 2); return s.reduce((x, y) => x + y, 0) / s.length; });
const grad = (a, t) => a.map((_, i) => { const i0 = Math.max(0, i - 1), i1 = Math.min(a.length - 1, i + 1); return (a[i1] - a[i0]) / Math.max(t[i1] - t[i0], 1e-9); });

/** 유효 프레임의 각도 시계열 {t, elbow, kneeL, kneeR, shoulderYaw, pelvisYaw, lean, wrist} (각도는 도, 손목은 m/s) */
export function angleSeries(frames) {
  const v = frames.filter(f => f.j), t = v.map(f => f.t);
  const mid = (f, a, b) => ({ x: (f.j[a].x + f.j[b].x) / 2, y: (f.j[a].y + f.j[b].y) / 2, z: (f.j[a].z + f.j[b].z) / 2 });
  const elbow = v.map(f => angle(f.j.rsho, f.j.relb, f.j.rwri)), kneeL = v.map(f => angle(f.j.lhip, f.j.lkne, f.j.lank)), kneeR = v.map(f => angle(f.j.rhip, f.j.rkne, f.j.rank));
  const lean = v.map(f => { const s = mid(f, "lsho", "rsho"), h = mid(f, "lhip", "rhip"), u = vec(h, s); return Math.acos(Math.max(-1, Math.min(1, u[1] / Math.hypot(...u)))) * DEG; });
  const sy = unwrap(v.map(f => yaw(f.j.rsho, f.j.lsho))).map(x => x * DEG), py = unwrap(v.map(f => yaw(f.j.rhip, f.j.lhip))).map(x => x * DEG);
  const wrist = v.map((f, i) => (i ? Math.hypot(...vec(v[i - 1].j.rwri, f.j.rwri)) / Math.max(f.t - v[i - 1].t, 1e-9) : 0));
  return { t, elbow, kneeL, kneeR, shoulderYaw: sy, pelvisYaw: py, lean, wrist };
}

const ROWS = [["elbow", "던지는 팔꿈치 각도"], ["kneeL", "앞무릎 각도"], ["kneeR", "뒷무릎 각도"], ["shoulderYaw", "어깨선 회전"], ["pelvisYaw", "골반선 회전"], ["lean", "몸통 기울기"]];

/** 관절 사용 표: 구간(발 들기~릴리스+0.1초)에서 값이 움직인 폭과 가장 빠르게 변한 속도(도/초). tLift·tBr은 시각(초) */
export function jointUse(frames, tLift, tBr, sport = "pitching") {
  const s = angleSeries(frames), idx = s.t.map((t, i) => i).filter(i => s.t[i] >= tLift && s.t[i] <= tBr + 0.1);
  if (idx.length < 3) return [];
  const rows = sport === "hitting" ? ROWS.map(([k, l]) => [k, k === "elbow" ? "뒤팔꿈치 각도" : l]) : ROWS;
  return rows.map(([k, label]) => {
    const a = smooth3(s[k]), g = grad(a, s.t), seg = idx.map(i => a[i]);
    let pk = idx[0]; for (const i of idx) if (Math.abs(g[i]) > Math.abs(g[pk])) pk = i;
    return { key: k, label, min: Math.min(...seg), max: Math.max(...seg), range: Math.max(...seg) - Math.min(...seg), peakDps: Math.abs(g[pk]), peakMs: (s.t[pk] - tBr) * 1000 };
  });
}

/** 몸 쓰는 순서: 골반·어깨선 회전, 팔꿈치 펴짐, 손목 속도가 가장 빨랐던 때(릴리스 기준 ms). 이른 순서로 정렬 */
export function sequence(frames, tFp, tBr, sport = "pitching") {
  const s = angleSeries(frames), idx = s.t.map((t, i) => i).filter(i => s.t[i] >= tFp - 0.05 && s.t[i] <= tBr + 0.05);
  if (idx.length < 3) return { steps: [], ordered: null };
  const peak = (arr, signed) => { const g = grad(smooth3(arr), s.t); let b = idx[0]; for (const i of idx) if ((signed ? g[i] : Math.abs(g[i])) > (signed ? g[b] : Math.abs(g[b]))) b = i; return b; };
  const items = [
    ["pelvis", "골반 회전", peak(s.pelvisYaw)], ["trunk", "어깨선(몸통) 회전", peak(s.shoulderYaw)],
    ["elbow", sport === "hitting" ? "뒤팔꿈치 펴짐" : "팔꿈치 펴짐", peak(s.elbow, true)], ["wrist", sport === "hitting" ? "뒤손목(타격)" : "손목(릴리스)", idx.reduce((b, i) => (s.wrist[i] > s.wrist[b] ? i : b), idx[0])],
  ].map(([key, label, i]) => ({ key, label, ms: (s.t[i] - tBr) * 1000 })).sort((a, b) => a.ms - b.ms);
  const ord = items.map(x => x.key), want = ["pelvis", "trunk", "elbow", "wrist"];
  return { steps: items, ordered: want.every((k, i) => ord.indexOf(k) === ord.indexOf(want[0]) + i) && ord[0] === "pelvis" };
}
