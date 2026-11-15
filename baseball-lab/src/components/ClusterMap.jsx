import { memo } from "react";

export const CL_COLORS = ["#5e6ad2", "#d0312d", "#17734f", "#c98a12", "#8a4fc7", "#0f8aa8"];

/** 선수 스타일 지도: 지표 여러 개를 2차원으로 압축(PCA)해 점으로 찍는다. 가까운 점일수록 스타일이 비슷하다. */
function ClusterMap({ cl, grp, onPick }) {
  const W = 640, H = 340, P = 18;
  const xs = cl.pts.map(p => p.x), ys = cl.pts.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const px = x => P + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * P), py = y => H - P - ((y - y0) / (y1 - y0 || 1)) * (H - 2 * P);
  return (
    <figure className="cmap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`선수 스타일 지도: ${cl.n}명을 ${cl.k}개 군집 색으로 표시`}>
        <rect x="0" y="0" width={W} height={H} rx="10" fill="var(--white)" stroke="var(--line)" />
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="var(--line)" /><line x1={P} y1={P} x2={P} y2={H - P} stroke="var(--line)" />
        {cl.pts.map(p => (
          <circle key={p.pid} cx={px(p.x)} cy={py(p.y)} r={grp === p.g ? 5 : 4} fill={CL_COLORS[p.g % CL_COLORS.length]} opacity={grp == null || grp === p.g ? 0.85 : 0.15}
            style={{ cursor: "pointer" }} onClick={() => onPick(p.g)}><title>{p.name} ({p.team})</title></circle>
        ))}
      </svg>
      <figcaption>점 하나가 선수 한 명이에요. 가까이 있을수록 {cl.feats.join("·")}로 본 스타일이 비슷합니다. 색은 자동 군집이고, 점을 누르면 그 군집만 강조됩니다. (두 축은 지표를 압축한 방향이라 숫자 의미는 없으며, 원래 정보의 약 {Math.round(cl.mapRatio * 100)}%를 담고 있어요.)</figcaption>
    </figure>
  );
}
export default memo(ClusterMap);
