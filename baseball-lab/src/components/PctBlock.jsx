import { topText } from "../lib/format.js";

function PctRow({ l }) {
  const head = <b>{l.label}{l.label !== l.en && <small>{l.en}</small>}</b>;
  if (l.pct == null) {
    return <div className="pct">{head}<div className="sub">기록이 없어 위치를 표시하지 않습니다.</div><div className="pct-val"><b>-</b></div></div>;
  }
  const color = l.pct >= 70 ? "#c8302a" : l.pct <= 30 ? "#2f5bd3" : "#6f7a91";
  return (
    <div className="pct" role="img" aria-label={`${l.label} 리그 ${topText(l)}`}>
      {head}
      <div className="pct-track">
        <span className="pct-bead" style={{ left: `clamp(15px,${l.pct}%,calc(100% - 15px))`, background: color }}>{l.pct}</span>
      </div>
      <div className="pct-val"><b>{l.display}</b> (리그 평균 {l.leagueDisplay})</div>
    </div>
  );
}

/** 리그 안에서의 위치: 파랑(하위)에서 빨강(상위)으로 이어지는 막대 위에 구슬로 표시 */
export default function PctBlock({ lines }) {
  return (
    <div className="pcts">
      {lines.map(l => <PctRow key={l.key} l={l} />)}
      {lines.some(l => l.pct != null) && (
        <div className="pct-scale" aria-hidden="true"><div /><div><span>하위</span><span>평균</span><span>상위</span></div><div /></div>
      )}
    </div>
  );
}
