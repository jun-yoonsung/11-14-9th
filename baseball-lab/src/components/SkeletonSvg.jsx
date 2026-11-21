import { skeletonShapes } from "../lib/skel.js";

/** 3D 관절 좌표를 한 시점에서 본 정지 그림 (영상 픽셀 없음). 머리는 모양을 위한 표시 */
export default function SkeletonSvg({ joints, cam, bounds, size = 160, label }) {
  const sh = skeletonShapes(joints, cam, { w: size, h: size, pad: 10, bounds });
  return (
    <svg className="sk" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label || cam.label}>
      <circle className="sk-head" cx={sh.head.x} cy={sh.head.y} r={sh.head.r} />
      {sh.lines.map((l, i) => <line key={i} className={l.cls} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />)}
      {sh.dots.map(d => <circle key={d.n} className={d.cls} cx={d.x} cy={d.y} r="2.8" />)}
    </svg>
  );
}
