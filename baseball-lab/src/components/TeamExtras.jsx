import { useEffect, useState } from "react";
import { Api } from "../lib/api.js";
import { TEAM_COLORS, TEAM_METHOD, teamPlot, teamSummary, wpText } from "../lib/teamview.js";

/** 팀 분석 결과 아래에 붙는 승률 추이·예측과 AI 해설. 파일이 없으면 아무것도 그리지 않는다. */
export default function TeamExtras({ rec }) {
  const [d, setD] = useState(null), [from, setFrom] = useState(2005);
  useEffect(() => {
    let live = true;
    Promise.all([Api.teamForecast(), Api.teamCommentary()]).then(([tf, tc]) => { if (live) setD({ tf, tc }); }).catch(() => {});
    return () => { live = false; };
  }, [rec]);
  const teams = rec.result.teams;
  if (!d) return null;
  const { tf, tc } = d, ids = teams.map(t => t.id), names = Object.fromEntries(teams.map(t => [t.id, t.name]));
  const hasF = tf && rec.season === tf.meta.base_season && ids.some(id => tf.teams[id]);
  const cards = ids.filter(id => tc?.[`${rec.season}-${id}`]);
  if (!hasF && !cards.length) return null;
  const g = hasF ? teamPlot(ids, names, tf, {}, from) : null, v = hasF ? tf.meta.validation : null;
  const sums = hasF ? ids.map(id => [id, teamSummary(tf, id)]).filter(x => x[1]) : [];
  return (
    <>
      {cards.length > 0 && (
        <section className="sec ai-box" aria-label="팀 AI 해설">
          <h2>팀 AI 해설</h2>
          <div className="tf-grid">{cards.map(id => { const c = tc[`${rec.season}-${id}`]; return (
            <div className="tf-card" key={id}><h3>{names[id]}</h3><p>{c.summary}</p>
              {c.strengths?.length > 0 && <ul className="plain">{c.strengths.map(t => <li key={t}>{t}</li>)}</ul>}
              {c.watch?.length > 0 && <ul className="plain">{c.watch.map(t => <li key={t}>{t}</li>)}</ul>}
              {c.outlook && <p className="sub">{c.outlook}</p>}</div>); })}</div>
          <p className="note">AI가 이 사이트가 계산한 수치만 바탕으로 미리 작성한 설명입니다. 숫자는 코드가 계산값과 대조해 확인했지만, 해석은 참고용으로 봐 주세요.</p>
        </section>
      )}
      {hasF && g && (
        <section className="sec fc-box" aria-label="팀 승률 예측">
          <h2>팀 승률 추이와 예측 <small className="tag">실험적 기능</small></h2>
          <p className="sub">{from}년 이후 시즌별 승률(실선)과 앞으로 {tf.meta.horizons.length}년 예측(점선)입니다. 승률 .500은 승과 패가 같다는 뜻이에요.</p>
          <div className="seg2" role="group" aria-label="그래프 기간" style={{ margin: "8px 0" }}>{[[2005, "2005년 이후"], [1982, "전체(1982~)"]].map(([y, l]) => <button key={y} type="button" aria-pressed={from === y} onClick={() => setFrom(y)}>{l}</button>)}</div>
          <ul className="legend2">{ids.map((id, i) => <li key={id}><i style={{ background: TEAM_COLORS[i % 4] }} />{names[id]}</li>)}</ul>
          <figure className="fc-chart">
            <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label="팀별 시즌 승률 그래프">
              {g.yt.map(t => <g key={t.y}><line x1={g.L} x2={g.W - g.R} y1={t.y} y2={t.y} className="fc-grid" /><text x={g.L - 6} y={t.y + 4} textAnchor="end" className="fc-tick">{t.label}</text></g>)}
              {g.paths.map(p => <path key={p.name} d={p.d} fill="none" stroke={p.color} strokeWidth={p.width} strokeDasharray={p.dash} strokeLinejoin="round" />)}
              {g.dots.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={q.r} fill={q.hollow ? "#fff" : q.color} stroke={q.color} strokeWidth="1.6"><title>{q.title}</title></circle>)}
              {g.xt.map(t => <text key={t.label} x={t.x} y={g.H - 10} textAnchor="middle" className="fc-tick">{t.label}</text>)}
            </svg>
          </figure>
          <div className="table-wrap"><table className="tf-t">
            <thead><tr><th>팀</th><th>{tf.meta.base_season} (올해)</th>{tf.meta.horizons.map(h => <th key={h}>{tf.meta.base_season + h} 예측</th>)}</tr></thead>
            <tbody>{ids.map(id => { const t = tf.teams[id]; return (
              <tr key={id}><td>{names[id]}</td><td>{t ? `${wpText(t.now.wp)} (${t.now.w}승 ${t.now.l}패)` : "-"}</td>
                {tf.meta.horizons.map(h => { const q = t?.pred.find(x => x.h === h); return <td key={h}>{q ? <>{wpText(q.wp)} <small>({wpText(q.lo)}~{wpText(q.hi)}, 약 {q.wins}승)</small></> : "-"}</td>; })}</tr>); })}</tbody></table></div>
          {sums.length > 0 && <>
            <h3 style={{ marginTop: 18 }}>팀 역대 요약</h3>
            <div className="table-wrap"><table className="tf-t">
              <thead><tr><th>팀</th><th>통산 승-패</th><th>통산 승률</th><th>최고 시즌</th><th>최저 시즌</th><th>승률 1위</th><th>5위 이내</th></tr></thead>
              <tbody>{sums.map(([id, s]) => <tr key={id}><td>{names[id]}</td><td>{s.w}-{s.l}</td><td>{wpText(s.wp)}</td><td>{s.best[0]}년 {wpText(s.best[5])}</td><td>{s.worst[0]}년 {wpText(s.worst[5])}</td><td>{s.first}회</td><td>{s.top5}회 / {s.seasons}시즌</td></tr>)}</tbody></table></div>
            <p className="note">{sums[0][1].from}년(또는 팀 창단 시즌)부터의 기록입니다. 순위는 그 시즌 승률 순서이며, 가을야구 진출 팀 수가 해마다 달라 "5위 이내"는 참고용입니다. 구단 이름이 바뀐 팀은 이어서 계산했습니다.</p></>}
          <details className="fc-acc"><summary>이 예측은 얼마나 믿을 수 있나요?</summary>
            <ul className="plain">
              {tf.meta.horizons.map(h => { const x = v[h], pick = x.mae[x.chosen]; return (
                <li key={h}>{h}년 뒤: 2019~{tf.meta.base_season} 시즌으로 시험했을 때 평균 오차는 승률 {pick.test.toFixed(3)}로, 작년 승률을 그대로 쓰는 방법({x.mae.last.test.toFixed(3)})보다 {pick.test < x.mae.last.test ? "작았" : "크거나 같았"}습니다. 쓴 방법은 {TEAM_METHOD[x.chosen] || x.chosen}이고, 80% 범위 적중률은 {Math.round(x.coverage80 * 100)}%였습니다.</li>); })}
              <li>팀 성적은 선수 이동·부상·외국인 선수 같은 변화가 커서 먼 미래일수록 예측이 평균(.500)에 가까워집니다. 시험 표본(팀·시즌 80개)도 작아서 참고용으로만 봐 주세요.</li>
              <li>예상 승수는 144경기 기준 승률 × 144입니다. 무승부는 승률 계산에서 뺐어요.</li>
            </ul>
          </details>
          <p className="note">학습 데이터: Kaggle <i>KBO Player Stats 1982–2026</i>(netsong, CC BY-NC-SA 4.0)을 팀·시즌별로 합쳐 만든 승패·득점·실점. 구단 이름이 바뀐 팀은 이어서 계산했습니다(OB→두산, 해태→KIA, 넥센→키움 등).</p>
        </section>
      )}
    </>
  );
}
