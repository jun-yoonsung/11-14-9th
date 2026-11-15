import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Api } from "../lib/api.js";
import { Store } from "../lib/storage.js";
import { similar, fmtFeat } from "../lib/rank.js";

/** 분석한 선수와 스타일이 비슷한 선수 5명. 성적의 좋고 나쁨이 아니라 타격·투구 스타일을 비교한다. */
export default function SimilarPlayers({ rec }) {
  const navigate = useNavigate();
  const [res, setRes] = useState(undefined);   // undefined: 계산 중, null: 비교할 수 없음
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [meta, rows] = await Promise.all([Api.meta(), rec.type === "batter" ? Api.batters(rec.season) : Api.pitchers(rec.season)]);
        const q = meta.qualify, pid = rec.params.target;
        const pool = rows.filter(s => s.pid === pid || (rec.type === "batter" ? s.pa >= q.batterPa : s.outs >= q.pitcherOuts));
        const r = similar(rec.type, pool, pid, 5);
        if (live) setRes(r ? { ...r, teams: Object.fromEntries(meta.teams.map(t => [t.id, t.name])) } : null);
      } catch (e) { if (live) setRes(null); }
    })();
    return () => { live = false; };
  }, [rec]);
  if (res === undefined) return <section className="sec"><h2>스타일이 비슷한 선수</h2><p className="sub">계산하는 중...</p></section>;
  if (!res) return null;
  const go = pid => {
    Store.saveWizard({ mode: "record", source: "site", type: rec.type, season: rec.season, target: pid, teams: [], metrics: rec.type === "batter" ? ["AVG", "OPS", "HR"] : ["ERA", "WHIP", "K9"] });
    navigate("/analyze#3");
  };
  return (
    <section className="sec">
      <h2>스타일이 비슷한 선수</h2>
      <p className="sub">{res.feats.join(", ")}를 비교해 규정을 채운 선수 {res.n}명 중 가장 가까운 선수를 찾았어요. 성적이 좋은지가 아니라 <b>어떤 스타일인지</b>를 비교한 결과입니다. 이름을 누르면 그 선수 분석을 시작합니다.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>선수</th><th>팀</th>{res.feats.map(f => <th key={f}>{f}</th>)}<th>닮은 정도</th><th>특히 닮은 점</th></tr></thead>
        <tbody>
          <tr className="me"><td>{res.me.name} (분석 선수)</td><td>{res.teams[res.me.team] || res.me.team}</td>{res.meVals.map((v, i) => <td key={i}>{fmtFeat(res.feats[i], v)}</td>)}<td>-</td><td>-</td></tr>
          {res.list.map(x => (
            <tr key={x.s.pid}>
              <td><button type="button" className="nm-btn" onClick={() => go(x.s.pid)}>{x.s.name}</button></td><td>{res.teams[x.s.team] || x.s.team}</td>
              {x.vals.map((v, i) => <td key={i}>{fmtFeat(res.feats[i], v)}</td>)}<td>{x.sim}%</td><td>{x.close.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="note">각 지표를 평균 0, 표준편차 1로 맞춘 뒤(z-점수) 지표 사이의 거리가 가까운 순서로 골랐어요. 닮은 정도는 거리를 0~100%로 바꾼 값이라 선수 사이의 상대적인 비교용입니다.</p>
    </section>
  );
}
