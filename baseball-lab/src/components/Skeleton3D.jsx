import { useEffect, useMemo, useRef, useState } from "react";
import { CAMS, boundsOf } from "../lib/skel.js";
import { JOINTS } from "../lib/form.js";
import SkeletonSvg from "./SkeletonSvg.jsx";

const toJ = row => Object.fromEntries(JOINTS.map((n, i) => [n, [row[i * 3], row[i * 3 + 1], row[i * 3 + 2]]]));

/** 3D 스켈레톤 돌려 보기: 드래그로 회전, 단추로 옆·정면·위, 막대로 프레임 이동. 영상 픽셀은 없다. */
export default function Skeleton3D({ frames3d, t, events, sport }) {
  const list = useMemo(() => frames3d.map(toJ), [frames3d]);
  const bounds = useMemo(() => boundsOf(list), [list]);
  const [i, setI] = useState(() => events?.fp ?? 0);
  const [cam, setCam] = useState({ ...CAMS.side });
  const [play, setPlay] = useState(false);
  const drag = useRef(null);
  const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!play) return;
    const id = setInterval(() => setI(k => (k + 1 >= list.length ? (setPlay(false), k) : k + 1)), 1000 / (reduce ? 6 : 15));
    return () => clearInterval(id);
  }, [play, list.length, reduce]);

  const down = e => { drag.current = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = e => { const d = drag.current; if (!d) return; setCam({ yaw: d.yaw + (e.clientX - d.x) * 0.012, pitch: Math.max(-1.5, Math.min(1.5, d.pitch + (e.clientY - d.y) * 0.012)) }); };
  const up = () => { drag.current = null; };
  const key = e => {
    const s = 0.12;
    if (e.key === "ArrowLeft") setCam(c => ({ ...c, yaw: c.yaw - s })); else if (e.key === "ArrowRight") setCam(c => ({ ...c, yaw: c.yaw + s }));
    else if (e.key === "ArrowUp") setCam(c => ({ ...c, pitch: Math.max(-1.5, c.pitch - s) })); else if (e.key === "ArrowDown") setCam(c => ({ ...c, pitch: Math.min(1.5, c.pitch + s) })); else return;
    e.preventDefault();
  };
  const mark = events ? [[sport === "hitting" ? "앞발 들기" : "발 들기", events.lift], ["착지", events.fp], [sport === "hitting" ? "타격" : "릴리스", events.br]].filter(x => x[1] != null) : [];
  const near = mark.find(([, k]) => k === i);

  return (
    <div className="sk3d">
      <div className="sk3d-view" tabIndex={0} role="group" aria-label="3D 스켈레톤. 드래그하거나 방향키로 돌려 볼 수 있어요" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
        <SkeletonSvg joints={list[i]} cam={cam} bounds={bounds} size={320} label={`${near ? near[0] + " 순간, " : ""}3D 스켈레톤`} />
        <span className="sk3d-tag">{near ? near[0] : `${(t[i] - t[0]).toFixed(2)}초`}</span>
      </div>
      <div className="sk3d-ctl">
        <div className="seg2" role="group" aria-label="보는 방향">
          {Object.entries(CAMS).map(([k, c]) => <button key={k} type="button" aria-pressed={cam.yaw === c.yaw && cam.pitch === c.pitch} onClick={() => setCam({ yaw: c.yaw, pitch: c.pitch })}>{c.label}</button>)}
        </div>
        <button className="btn small" type="button" onClick={() => { if (i + 1 >= list.length) setI(0); setPlay(p => !p); }}>{play ? "멈춤" : "재생"}</button>
      </div>
      <input className="sk3d-bar" type="range" min="0" max={list.length - 1} value={i} aria-label="프레임" onChange={e => { setPlay(false); setI(+e.target.value); }} />
      <div className="sk3d-marks">{mark.map(([l, k]) => <button key={l} type="button" className="linkbtn" onClick={() => { setPlay(false); setI(k); }}>{l}</button>)}</div>
      <p className="note">영상으로 추정한 3D라 실제 몸의 움직임과 차이가 있을 수 있어요. 머리는 모양을 위한 표시입니다.</p>
    </div>
  );
}
