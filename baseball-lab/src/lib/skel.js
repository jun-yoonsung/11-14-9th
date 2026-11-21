/* 3D 스켈레톤 투영과 그리기 (React 화면·PDF 공용). 좌표: X=투구 방향, Y=위, Z=오른쪽 (맞춘 좌표, m). 영상 픽셀은 쓰지 않는다. */
import { JOINTS } from "./form.js";

export const CAMS = {
  side: { yaw: 0, pitch: 0, label: "옆에서" },
  front: { yaw: Math.PI / 2, pitch: 0, label: "정면에서" },
  top: { yaw: 0, pitch: Math.PI / 2, label: "위에서" },
};
export const BONES = [["lsho", "rsho"], ["lhip", "rhip"], ["lsho", "lhip"], ["rsho", "rhip"], ["lsho", "lelb"], ["lelb", "lwri"], ["rsho", "relb"], ["relb", "rwri"], ["lhip", "lkne"], ["lkne", "lank"], ["rhip", "rkne"], ["rkne", "rank"]];
const THROW = new Set(["rsho-relb", "relb-rwri"]);     // 던지는 팔(오른쪽 = 맞춘 좌표에서 항상 던지는 쪽)

/** 3D→2D 직교 투영. yaw는 세로축(Y), pitch는 가로축 둘레 회전. 반환 {joint:[sx, sy, depth]} (sy는 아래가 +) */
export function project(J, cam) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const out = {};
  for (const n of JOINTS) {
    const [X, Y, Z] = J[n];
    const x = X * cy + Z * sy, z = -X * sy + Z * cy;
    const y = Y * cp - z * sp, d = Y * sp + z * cp;
    out[n] = [x, -y, d];
  }
  return out;
}

/** 프레임들의 모든 관절을 덮는 한 변 길이(m)와 중심 — 모든 프레임·시점에서 같은 크기로 그리려고 */
export function boundsOf(list) {
  let r = 0.5;
  const c = [0, 0, 0]; let n = 0;
  for (const J of list) for (const k of JOINTS) { c[0] += J[k][0]; c[1] += J[k][1]; c[2] += J[k][2]; n++; }
  if (n) { c[0] /= n; c[1] /= n; c[2] /= n; }
  for (const J of list) for (const k of JOINTS) r = Math.max(r, Math.hypot(J[k][0] - c[0], J[k][1] - c[1], J[k][2] - c[2]));
  return { c, r };
}

/** 화면에 그릴 선·점·머리 표시. box = {w,h,pad,bounds}. 머리는 모양을 위한 표시일 뿐 측정값이 아니다 */
export function skeletonShapes(J, cam, box) {
  const { w, h, pad = 8, bounds } = box, b = bounds || boundsOf([J]);
  const rot = project({ ...Object.fromEntries(JOINTS.map(n => [n, [J[n][0] - b.c[0], J[n][1] - b.c[1], J[n][2] - b.c[2]]])) }, cam);
  const s = (Math.min(w, h) / 2 - pad) / b.r, cx = w / 2, cy = h / 2;
  const pt = n => [cx + rot[n][0] * s, cy + rot[n][1] * s, rot[n][2]];
  const P = Object.fromEntries(JOINTS.map(n => [n, pt(n)]));
  const lines = BONES.map(([a, c]) => ({ x1: P[a][0], y1: P[a][1], x2: P[c][0], y2: P[c][1], d: (P[a][2] + P[c][2]) / 2, cls: THROW.has(`${a}-${c}`) ? "sk-throw" : "sk-bone" }))
    .sort((p, q) => p.d - q.d);
  const dots = JOINTS.map(n => ({ n, x: P[n][0], y: P[n][1], d: P[n][2], cls: n[0] === "r" ? "sk-throw" : "sk-dot" }));
  const sm = [(P.lsho[0] + P.rsho[0]) / 2, (P.lsho[1] + P.rsho[1]) / 2], hm = [(P.lhip[0] + P.rhip[0]) / 2, (P.lhip[1] + P.rhip[1]) / 2];
  const up = [sm[0] - hm[0], sm[1] - hm[1]], len = Math.hypot(up[0], up[1]) || 1, head = { x: sm[0] + (up[0] / len) * len * 0.45, y: sm[1] + (up[1] / len) * len * 0.45, r: Math.max(len * 0.22, 3) };
  return { lines, dots, head };
}

const f1 = v => (Math.round(v * 10) / 10).toString();
/** PDF·정지 그림용 SVG 문자열. 색은 CSS 클래스(.sk-bone/.sk-throw/.sk-dot/.sk-head)로 입힌다 */
export function skeletonSvg(J, cam, box) {
  const sh = skeletonShapes(J, cam, box), { w, h } = box;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">`
    + `<circle class="sk-head" cx="${f1(sh.head.x)}" cy="${f1(sh.head.y)}" r="${f1(sh.head.r)}"/>`
    + sh.lines.map(l => `<line class="${l.cls}" x1="${f1(l.x1)}" y1="${f1(l.y1)}" x2="${f1(l.x2)}" y2="${f1(l.y2)}"/>`).join("")
    + sh.dots.map(d => `<circle class="${d.cls}" cx="${f1(d.x)}" cy="${f1(d.y)}" r="2.6"/>`).join("") + `</svg>`;
}
