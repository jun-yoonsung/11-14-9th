import { useEffect, useState } from "react";
import { Api } from "../lib/api.js";
import { slash, f1, f3 } from "../lib/spray.js";
import { fx, sx, tone, bipStats, linesSvg, TEAM_LINE } from "../lib/more.js";

/** 팀 결과 추가 분석: 타순별 성적, 라인업 시뮬레이션, 팀 Elo와 경기 예측, 수비 실책, 타구 유형 (2026 시즌만) */
export default function TeamMore({ rec }) {
  const [m, setM] = useState(null);
  useEffect(() => { let on = true; Api.more().then(d => on && setM(d)); return () => { on = false; }; }, [rec]);
  if (!m || rec.season !== 2026) return null;
  const teams = rec.result.teams.filter(t => m.t[t.id] && m.t[t.id].lineup);
  if (!teams.length) return null;
  const g = m.meta.game, lg = m.meta.lineup.lg_slot;
  const ids = teams.map(t => t.id);
  const ranked = Object.entries(g.elo).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  return (
    <section className="sec fc-box spray" aria-label="팀 타순과 경기 예측">
      <h2>타순·라인업·경기 예측 <small className="tag">2026 시즌</small></h2>
      <p className="sub">타순별 성적, 타순을 바꿨을 때의 기대 득점, 팀 전력(Elo)과 경기 이길 확률, 수비 실책을 투구 단위·경기 단위 기록으로 계산했습니다.</p>

      <h3>타순별 OPS</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>타순</th><th>리그</th>{teams.map(t => <th key={t.id}>{t.name}</th>)}</tr></thead>
        <tbody>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map(s => { const l = slash(lg[s][0]); return <tr key={s}><td>{s}번</td><td>{l ? f3(l.ops) : "-"}</td>{teams.map(t => { const a = slash(m.t[t.id].lineup.slots[s][0]); return <td key={t.id} className={a && a.pa >= 150 ? tone(a.ops - l.ops) : ""}>{a ? f3(a.ops) : "-"}<small> ({a ? a.pa : 0})</small></td>; })}</tr>; })}</tbody>
      </table></div>
      <p className="legend">괄호는 타석 수이고, 150타석 미만은 색을 넣지 않았어요. 대타·교체 선수가 섞여 있습니다.</p>

      <h3>라인업 시뮬레이션 (9이닝 기대 득점)</h3>
      {teams.map(t => { const L = m.t[t.id].lineup.lineups, base = L["실제 라인업(평균 타순)"].runs; return (
        <div key={t.id}>
          <div className="table-wrap"><table>
            <thead><tr><th>{t.name}</th><th>기대 득점</th><th>실제 대비</th><th>1~9번</th></tr></thead>
            <tbody>{Object.entries(L).map(([k, v]) => <tr key={k} className={k.startsWith("최적") ? "mine" : ""}><td>{k}</td><td>{fx(v.runs, 2)}</td><td className={tone(v.runs - base)}>{sx(v.runs - base, 2)}<small> (144경기 {sx((v.runs - base) * 144, 0)}점)</small></td><td>{v.order.join(" → ")}</td></tr>)}</tbody>
          </table></div>
        </div>); })}
      <p className="legend">팀에서 가장 많이 타석에 선 9명의 시즌 기록(보정)으로, 아웃·주자 상황별 진루 패턴(리그 전체 실제 기록)을 이어 붙여 9이닝 평균 득점을 계산했습니다. 수비·주루·상대 투수·선수 간 상호작용은 반영하지 못했고, 타순 차이는 대개 경기당 0.1점 안팎이라 한 시즌 표본에서는 참고용입니다.</p>

      <h3>팀 전력(Elo)과 경기 이길 확률</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>팀</th><th>Elo</th><th>순위(10팀 중)</th></tr></thead>
        <tbody>{teams.map(t => <tr key={t.id}><td>{t.name}</td><td>{fx(g.elo[t.id], 0)}</td><td>{ranked.indexOf(t.id) + 1}위</td></tr>)}</tbody>
      </table></div>
      <div className="spray-svg" style={{ maxWidth: 560 }} dangerouslySetInnerHTML={{ __html: linesSvg(teams.map((t, i) => ({ name: t.name, color: TEAM_LINE[i % 4], pts: g.traj[t.id] })), { label: "팀 Elo 추이" }) }} />
      <ul className="legend2">{teams.map((t, i) => <li key={t.id}><i style={{ background: TEAM_LINE[i % 4] }} />{t.name}</li>)}</ul>
      {teams.length >= 2 && (
        <div className="table-wrap"><table>
          <thead><tr><th>홈팀 \ 원정팀</th>{teams.map(t => <th key={t.id}>{t.name}</th>)}</tr></thead>
          <tbody>{teams.map(h => <tr key={h.id}><td>{h.name}(홈)</td>{teams.map(a => <td key={a.id}>{h.id === a.id ? "-" : f1(g.matrix[h.id][a.id] * 100) + "%"}</td>)}</tr>)}</tbody>
        </table></div>
      )}
      <p className="legend">표는 행의 팀이 홈에서 열의 팀을 이길 확률입니다(선발 투수와 최근 폼은 평균으로 둠). 시즌 종료 시점 전력 기준이에요. 모델은 7~10월 {g.n_eval}경기를 앞으로 걸으며 검증해 {g.best}을(를) 골랐고, 그래도 맞히는 정확도는 55% 안팎이라 야구 경기 결과는 대부분 불확실하다는 점을 보여 줍니다.</p>
      <details className="explain"><summary>경기 예측 모델 비교</summary>
        <div className="table-wrap"><table><thead><tr><th>모델</th><th>로그손실</th><th>정확도</th></tr></thead>
          <tbody>{Object.entries(g.models).map(([k, v]) => <tr key={k} className={k === g.best ? "mine" : ""}><td>{k}</td><td>{v.logloss}</td><td>{f1(v.acc * 100)}%</td></tr>)}</tbody></table></div>
        <p className="legend">Elo는 경기마다 점수 차(로그)와 홈 이점({g.H})을 반영해 갱신했고(K={g.K}), 7월부터 매달 그 전 경기로 다시 학습해 그 달을 예측하는 방식으로 검증했습니다. 로그손실은 작을수록 좋고 항상 50%는 0.693입니다.</p>
      </details>

      {ids.some(id => m.t[id].bip) && (
        <>
          <h3>수비 실책을 낸 위치</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>팀</th>{m.meta.bip.pos.map(p => <th key={p}>{p}</th>)}<th>합계</th></tr></thead>
            <tbody>{teams.map(t => { const e = m.t[t.id].bip && m.t[t.id].bip.err; return e ? <tr key={t.id}><td>{t.name}</td>{e.map((v, i) => <td key={i}>{v}</td>)}<td><b>{e.reduce((a, b) => a + b, 0)}</b></td></tr> : null; })}</tbody>
          </table></div>
          <p className="legend">타자를 출루시킨 실책(실책출루)만 셌습니다. 송구·포구 실책 모두 포함하고, 주자가 있는 상황의 실책이나 수비 기회 수는 반영하지 못했어요.</p>
          <div className="table-wrap"><table>
            <thead><tr><th>팀</th><th>타선 땅볼:뜬공 아웃</th><th>타선 병살 비율</th><th>투수진 땅볼:뜬공 아웃</th><th>투수진 병살 유도 비율</th></tr></thead>
            <tbody>{teams.map(t => { const b = m.t[t.id].bip; const a = bipStats(b.bat), f = b.fld && bipStats(b.fld); return <tr key={t.id}><td>{t.name}</td><td>{fx(a.gbfb, 2)}</td><td>{f1(a.gdp)}%</td><td>{f ? fx(f.gbfb, 2) : "-"}</td><td>{f ? f1(f.gdp) + "%" : "-"}</td></tr>; })}</tbody>
          </table></div>
        </>
      )}
    </section>
  );
}
