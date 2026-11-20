import { useEffect, useState } from "react";
import { Api } from "../lib/api.js";
import { slash, f1, f3 } from "../lib/spray.js";
import { SIT_LABELS, SIT_SHOW, fmt, sgn } from "../lib/pitchlab.js";

const cls = d => (d == null || Math.abs(d) < 1e-9 ? "" : d > 0 ? "good" : "bad");

/** 팀 결과: 득점 기여(RE24)·승리 기여(WPA)와 상황별 타선·투수진 성적 (2026 시즌만) */
export default function TeamSituation({ rec }) {
  const [si, setSi] = useState(null);
  useEffect(() => { let on = true; Api.situ().then(d => on && setSi(d)); return () => { on = false; }; }, [rec]);
  if (!si || rec.season !== 2026) return null;
  const teams = rec.result.teams.filter(t => si.t[t.id]);
  if (!teams.length) return null;
  const lg = si.meta.lg;
  return (
    <section className="sec fc-box spray" aria-label="팀 상황별 성적">
      <h2>상황별 성적과 득점·승리 기여 <small className="tag">2026 시즌</small></h2>
      <p className="sub">타석이 시작될 때의 주자·아웃·점수 상황으로 나눈 성적입니다. 한 시즌 표본이라 득점권 같은 줄의 차이는 우연일 가능성이 큽니다.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>팀</th><th>타선 득점 기여 (RE24)</th><th>타선 승리 기여 (WPA)</th><th>투수진 득점 억제</th><th>투수진 승리 기여</th></tr></thead>
        <tbody>{teams.map(t => { const x = si.t[t.id]; return <tr key={t.id}><td>{t.name}</td><td className={cls(x.bat.re)}>{sgn(x.bat.re, 0)}점</td><td className={cls(x.bat.wpa)}>{sgn(x.bat.wpa, 1)}승</td><td className={cls(x.fld.re)}>{sgn(x.fld.re, 0)}점</td><td className={cls(x.fld.wpa)}>{sgn(x.fld.wpa, 1)}승</td></tr>; })}</tbody>
      </table></div>
      <p className="legend">RE24는 타석마다 늘거나 줄어든 기대 득점의 합, WPA는 이길 확률 변화의 합입니다. 투수진은 부호를 뒤집어 플러스가 좋은 값이에요. 팀 전체 합은 0 근처가 평균입니다.</p>
      {[["bat", "타선"], ["fld", "투수진"]].map(([k, nm]) => (
        <div key={k}>
          <h3>상황별 OPS — {nm}{k === "fld" ? " (허용)" : ""}</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>상황</th><th>리그</th>{teams.map(t => <th key={t.id}>{t.name}</th>)}</tr></thead>
            <tbody>{SIT_SHOW.map(s => { const l = slash(lg.sit[s]); return l ? <tr key={s}><td>{SIT_LABELS[k === "bat" ? "bat" : "pit"][s]}</td><td>{f3(l.ops)}</td>{teams.map(t => { const a = slash(si.t[t.id][k].sit[s]); const d = a ? (k === "bat" ? a.ops - l.ops : l.ops - a.ops) : null; return <td key={t.id} className={a && a.pa >= 150 ? cls(d) : ""}>{a ? f3(a.ops) : "-"}<small> ({a ? a.pa : 0})</small></td>; })}</tr> : null; })}</tbody>
          </table></div>
        </div>
      ))}
      <p className="legend">괄호는 타석 수이고, 150타석 미만 칸은 색을 넣지 않았습니다. 초록은 리그보다 좋은 쪽입니다. 승리 확률 모델은 {si.meta.wp_best}이며 자세한 비교는 선수 분석의 "이 분석은 어떻게 만들었나"에서 볼 수 있어요.</p>
    </section>
  );
}
