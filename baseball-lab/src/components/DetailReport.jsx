import { Fragment } from "react";
import { top } from "../lib/detail.js";

// HashRouter에서는 href="#id"가 주소 이동으로 처리되므로 직접 스크롤한다
const goTo = id => e => {
  e.preventDefault();
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
};

const tone = t => (t === "good" ? "good" : t === "bad" ? "bad" : undefined);
const MixColors = ["#2146c7", "#d0312d", "#17734f", "#8d9ab8", "#c9892b", "#7a4fc2", "#2f9bb0", "#555"];

const MiniPct = ({ p }) => (p == null ? <span className="muted">-</span> : <><span className="mp" title={`리그 ${top(p)}`}><i style={{ width: p + "%" }} /></span><b>{p}</b></>);

function Stack({ c }) {
  const colors = ["#8d9ab8", "#4a68d8", "#2146c7", "#d0312d"];
  const bar = (label, list) => (
    <div className="stk"><b>{label}</b>
      <div className="stk-bar">{list.map((s, i) => s.pct > 0 && <span key={s.label} style={{ width: s.pct + "%", background: colors[i] }} title={`${s.label} ${s.pct.toFixed(0)}%`}>{s.pct >= 9 ? s.pct.toFixed(0) + "%" : ""}</span>)}</div></div>
  );
  return <>{bar("이 선수", c.player)}{bar("리그", c.league)}
    <div className="stk-legend">{c.player.map((s, i) => <span key={s.label}><i style={{ background: colors[i] }} />{s.label} {s.n}개</span>)}</div></>;
}

function Per9({ c }) {
  const max = Math.max(...c.player.map(s => s.v || 0), ...c.league.map(s => s.v || 0), 1);
  return <>
    {c.player.map((s, i) => {
      const lg = c.league[i].v, good = i === 0 ? s.v > lg : s.v < lg;
      return (
        <div key={s.label} className={"tbar" + (good ? " best" : "")}><b>{s.label}</b>
          <div className="tbar-track"><span className="tbar-fill" style={{ width: ((s.v || 0) / max) * 100 + "%" }} /><span className="tbar-avg" style={{ left: ((lg || 0) / max) * 100 + "%" }} /></div>
          <span className="v">{s.v == null ? "-" : s.v.toFixed(1)}</span></div>
      );
    })}
    <p className="legend"><i style={{ background: "#c8302a", width: 3 }} />리그 평균</p>
  </>;
}

export function ListCard({ title, cls, list }) {
  return (
    <div className={"card2 " + cls}><h3>{title}</h3>
      {list.length ? <ul>{list.map(i => (
        <li key={i.key}><b>{i.label}</b> {i.display} <span className="muted">(리그 평균 {i.leagueDisplay}, {top(i.pct)})</span><br /><small>{i.desc}</small></li>
      ))}</ul> : <p className="muted">백분위를 계산할 수 있는 지표가 없습니다.</p>}
    </div>
  );
}

/** 타자·투수 상세 분석 보고서 (build()가 만든 rep를 그린다) */
export default function DetailReport({ rep }) {
  const isBat = rep.type === "batter";
  const groups = [...new Set(rep.items.map(i => i.group))];
  return (
    <>
      <nav className="rep-nav" aria-label="보고서 목차">
        <a href="#r-sum" onClick={goTo("r-sum")}>종합 평가</a><a href="#r-prof" onClick={goTo("r-prof")}>능력 프로필</a><a href="#r-all" onClick={goTo("r-all")}>전체 지표</a><a href="#r-comp" onClick={goTo("r-comp")}>{rep.composition.title}</a>
        {rep.trend && <a href="#r-trend" onClick={goTo("r-trend")}>월별 추이</a>}{rep.pitchMix && <a href="#r-mix" onClick={goTo("r-mix")}>구종 구성</a>}{rep.similar.length > 0 && <a href="#r-similar" onClick={goTo("r-similar")}>비슷한 선수</a>}<a href="#r-note" onClick={goTo("r-note")}>읽는 법</a>
      </nav>

      <section className="sec rep" id="r-sum"><h2>종합 평가</h2>
        <p className="headline" dangerouslySetInnerHTML={{ __html: rep.headline }} />
        <div className="two-cards"><ListCard title="강점" cls="pos" list={rep.strengths} /><ListCard title="보완할 점" cls="neg" list={rep.weaknesses} /></div></section>

      <section className="sec rep" id="r-prof"><h2>능력 프로필</h2>
        <p className="sub">{isBat ? "타격" : "투구"} 능력을 영역으로 나눠, 영역별 지표의 리그 백분위 평균을 보여 줍니다. 높을수록 리그에서 앞선 영역입니다.</p>
        <div className="groups">
          {rep.profile.map(p => p.score != null && (
            <div className="grp" key={p.name}>
              <div className="grp-h"><b>{p.name}</b><span>{p.desc}</span></div>
              <div className="grp-bar"><span className={"grp-fill" + (p.score >= 70 ? " hi" : p.score <= 30 ? " lo" : "")} style={{ width: p.score + "%" }} /></div>
              <div className="grp-v"><b>{p.score}</b><small>{top(p.score)}</small></div>
            </div>
          ))}
        </div></section>

      <section className="sec rep" id="r-all"><h2>전체 지표</h2>
        <p className="sub">{isBat ? "타자" : "투수"}에게 필요한 지표 {rep.items.length}개를 영역별로 정리했습니다. 위 분석에서 고른 지표만이 아니라 전부 계산했습니다.</p>
        <div className="table-wrap"><table className="alltab">
          <thead><tr><th>지표</th><th>선수 기록</th><th>리그 평균</th><th>차이</th><th>백분위</th><th>순위</th></tr></thead>
          <tbody>{groups.map(g => (
            <Fragment key={g}>
              <tr className="gh"><td colSpan={6}>{g}</td></tr>
              {rep.items.filter(i => i.group === g).map(i => (
                <tr key={i.key}><td>{i.label} <small className="muted">{i.en}</small></td><td>{i.display}</td><td>{i.leagueDisplay}</td>
                  <td className={tone(i.tone)}>{i.value == null ? "-" : i.diffDisplay}</td><td className="mpc"><MiniPct p={i.pct} /></td><td>{i.rank ? i.rank + "위" : "-"}</td></tr>
              ))}
            </Fragment>
          ))}</tbody></table></div>
        <details className="gloss"><summary>지표 설명과 계산식 보기</summary>
          <div className="table-wrap"><table><thead><tr><th>지표</th><th>계산식</th><th>뜻</th></tr></thead>
            <tbody>{rep.items.map(i => <tr key={i.key}><td>{i.label} <small className="muted">{i.en}</small></td><td className="l">{i.how}</td><td className="l">{i.desc}</td></tr>)}</tbody></table></div>
        </details></section>

      <section className="sec rep" id="r-comp"><h2>{rep.composition.title}</h2><p className="sub">{rep.composition.note}</p>
        {rep.composition.kind === "stack" ? <Stack c={rep.composition} /> : <Per9 c={rep.composition} />}</section>

      {rep.trend && (
        <section className="sec rep" id="r-trend"><h2>월별 추이</h2>
          <p className="sub">시즌 중 컨디션이 어떻게 변했는지 월별로 다시 계산했습니다. 표본이 충분한 달({isBat ? "50타석" : "10이닝"} 이상)만 가장 좋은 달은 초록색, 가장 나쁜 달은 빨간색으로 표시합니다.</p>
          <div className="table-wrap"><table>
            <thead><tr><th>지표</th>{rep.trend.months.map(m => <th key={m.label}>{m.label}<br /><small className="muted">{m.size}</small></th>)}</tr></thead>
            <tbody>{rep.trend.rows.map(r => <tr key={r.label}><td>{r.label}</td>{r.cells.map((c, i) => <td key={i} className={tone(c.tone)}>{c.display}</td>)}</tr>)}</tbody></table></div></section>
      )}

      {rep.pitchMix && (
        <section className="sec rep" id="r-mix"><h2>구종 구성</h2>
          <p className="sub">던진 공의 종류별 비율과 평균 구속입니다. 구속은 투구 추적 기록 기준입니다.</p>
          <div className="stk"><b>구종</b>
            <div className="stk-bar">{rep.pitchMix.map((m, i) => <span key={m.pitch} style={{ width: m.pct + "%", background: MixColors[i % 8] }} title={`${m.pitch} ${m.pct.toFixed(0)}%`}>{m.pct >= 9 ? `${m.pitch} ${m.pct.toFixed(0)}%` : ""}</span>)}</div></div>
          <div className="table-wrap"><table><thead><tr><th>구종</th><th>투구 수</th><th>비율</th><th>평균 구속</th></tr></thead>
            <tbody>{rep.pitchMix.map((m, i) => <tr key={m.pitch}><td><i className="dot" style={{ background: MixColors[i % 8] }} />{m.pitch}</td><td>{m.n}</td><td>{m.pct.toFixed(1)}%</td><td>{m.kmh.toFixed(1)}km/h</td></tr>)}</tbody></table></div></section>
      )}

      {rep.similar.length > 0 && (
        <section className="sec rep" id="r-similar"><h2>{rep.similarTitle || `비슷한 유형의 ${isBat ? "타자" : "투수"}`}</h2>
          <p className="sub">{isBat ? "주요 지표의 리그 위치가 가장 비슷한 선수입니다." : "같은 역할(선발은 선발끼리, 불펜은 불펜끼리) 안에서 주요 지표의 위치가 가장 비슷한 선수입니다."} 비슷한 정도가 100에 가까울수록 닮았습니다.</p>
          <div className="sim">{rep.similar.map(s => <div className="sim-i" key={s.name}><b>{s.name}</b><span>{s.team} · {s.pos}</span><em>비슷한 정도 {s.similarity}</em><small>{s.key}</small></div>)}</div></section>
      )}

      <section className="sec rep" id="r-note"><h2>읽을 때 알아둘 점</h2><ul className="plain">{rep.notes.map(n => <li key={n}>{n}</li>)}</ul></section>
    </>
  );
}
