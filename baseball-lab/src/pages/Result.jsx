import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Api } from "../lib/api.js";
import { Store } from "../lib/storage.js";
import { TYPES } from "../lib/stats.js";
import { build } from "../lib/detail.js";
import { generate, fileName, ipText } from "../lib/report.js";
import { dateKo, topText } from "../lib/format.js";
import PctBlock from "../components/PctBlock.jsx";
import DetailReport from "../components/DetailReport.jsx";
import SimilarPlayers from "../components/SimilarPlayers.jsx";
import AiCommentary from "../components/AiCommentary.jsx";
import Forecast from "../components/Forecast.jsx";
import Career from "../components/Career.jsx";
import TeamExtras from "../components/TeamExtras.jsx";
import { qualFor } from "../lib/season.js";
import { useScene } from "../context/SceneContext.jsx";
import { useToast } from "../context/ToastContext.jsx";

const kpiNote = l => (l.value == null ? "기록 없음" : l.tone === "even" ? "리그 평균과 같음" : `리그보다 ${l.diffDisplay}`);
const RAW = {
  batter: [["g", "경기"], ["pa", "타석"], ["ab", "타수"], ["h", "안타"], ["d2", "2루타"], ["d3", "3루타"], ["hr", "홈런"], ["rbi", "타점"], ["r", "득점"], ["bb", "볼넷"], ["hbp", "사구"], ["so", "삼진"], ["sf", "희생플라이"]],
  pitcher: [["g", "경기"], ["gs", "선발"], ["ip", "이닝"], ["h", "피안타"], ["hr", "피홈런"], ["bb", "볼넷"], ["so", "삼진"], ["er", "자책점"], ["r", "실점"], ["pitches", "투구 수"]],
};

function PlayerView({ rec, r }) {
  const TY = TYPES[rec.type];
  const raw = { ...r.raw, ip: ipText(r.raw.outs) };
  const cols = RAW[rec.type].filter(c => raw[c[0]] != null);   // 과거 시즌은 없는 열(선발 경기, 투구 수 등)을 뺀다
  return (
    <>
      <AiCommentary rec={rec} />
      <div className="kpis">{r.lines.map(l => (
        <div className="kpi" key={l.key}><small>{l.label}{l.label !== l.en ? " " + l.en : ""}</small><strong>{l.display}</strong><em className={l.value == null ? "" : l.tone}>{kpiNote(l)}</em></div>
      ))}</div>
      <section className="sec"><div className="board"><h2>리그 안에서의 위치</h2>
        {r.lines.some(l => l.pct != null) && <p className="sub">구슬 안 숫자는 백분위예요. 91이면 규정을 채운 리그 {r.noun || TY.noun} {r.leagueN}명 중 91%보다 좋은 기록이라는 뜻입니다. 높을수록 좋은 성적이고, ERA처럼 낮을수록 좋은 지표도 같은 방향으로 맞췄어요.</p>}
        <PctBlock lines={r.lines} />
        <div className="insight">{r.insight}</div>
        {!r.qualified && <p className="note">이 선수는 규정({r.qualText})을 채우지 못해 순위는 매기지 않고 백분위만 참고용으로 보여 줍니다.</p>}
      </div></section>
      <DetailBox rec={rec} />
      <SimilarPlayers rec={rec} />
      <Career rec={rec} />
      <Forecast rec={rec} />
      <section className="sec"><h2>선택한 지표 상세</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>지표</th><th>선수 기록</th><th>리그 평균</th><th>차이</th><th>리그 위치</th></tr></thead>
          <tbody>{r.lines.map(l => (
            <tr key={l.key}><td>{l.label}{l.label !== l.en ? " " + l.en : ""}</td><td>{l.display}</td><td>{l.leagueDisplay}</td>
              <td className={l.tone === "even" || l.value == null ? undefined : l.tone}>{l.value == null ? "-" : l.diffDisplay}</td>
              <td>{l.pct == null ? "-" : `${topText(l)}${l.rank ? `, ${l.rank}위` : ""}`}</td></tr>
          ))}</tbody></table></div></section>
      <section className="sec"><h2>기록 원자료</h2>
        <div className="table-wrap"><table><thead><tr>{cols.map(c => <th key={c[0]}>{c[1]}</th>)}</tr></thead><tbody><tr>{cols.map(c => <td key={c[0]}>{raw[c[0]]}</td>)}</tr></tbody></table></div></section>
    </>
  );
}

/** 상세 보고서: 저장된 것이 있으면 그대로, 이전에 만든 기록이면 지금 만든다 */
function DetailBox({ rec }) {
  const [rep, setRep] = useState(rec.result.report || null);
  useEffect(() => {
    if (rep) return;
    let dead = false;
    (async () => {
      try {
        const meta = await Api.meta();
        const rows = await (rec.type === "batter" ? Api.batters(rec.season) : Api.pitchers(rec.season));
        const monthly = await Api.monthly(rec.type, rec.params.target, rec.season);
        const mix = rec.type === "pitcher" ? await Api.pitchmix(rec.params.target, rec.season) : null;
        if (!dead) setRep(build(rec.type, rows, rec.params.target, qualFor(meta, rec.season), meta, monthly, mix));
      } catch (e) { /* 만들지 못하면 상세 보고서 없이 보여 준다 */ }
    })();
    return () => { dead = true; };
  }, [rec, rep]);
  if (!rep) return null;
  return <div><div className="rep-head"><h2 className="rep-title">{rec.type === "batter" ? "타자" : "투수"} 상세 분석 보고서</h2></div><DetailReport rep={rep} /></div>;
}

function TeamView({ rec, r }) {
  return (
    <>
      <section className="sec" style={{ marginTop: 0 }}><h2>팀별 기록 요약</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>팀</th>{r.metrics.map(m => <th key={m.key}>{m.label}</th>)}</tr></thead>
          <tbody>{r.teams.map(t => (
            <tr key={t.id}><td>{t.name}</td>{r.metrics.map(m => { const it = m.items.find(x => x.id === t.id); return <td key={m.key} className={m.bestId === t.id ? "good" : undefined}>{it.display}</td>; })}</tr>
          ))}</tbody></table></div>
        <p className="note">초록색 굵은 글씨는 선택한 팀 중 가장 좋은 기록입니다.</p>
        <div className="insight">{r.insight}</div></section>
      <TeamExtras rec={rec} />
      <section className="sec"><h2>지표별 비교</h2>
        {r.metrics.map(m => {
          const max = Math.max(...m.items.map(i => Math.abs(i.value)).concat([Math.abs(m.league)]), 1);
          return (
            <div className="team-metric" key={m.key}>
              <h3>{m.label}{m.better === "low" ? " (낮을수록 좋음)" : ""}, 리그 평균 {m.leagueDisplay}</h3>
              {m.items.map(it => {
                const wd = m.diverge ? (Math.abs(it.value) / max) * 50 : (it.value / max) * 100;
                const style = m.diverge ? (it.value >= 0 ? { left: "50%", width: wd + "%" } : { left: 50 - wd + "%", width: wd + "%" }) : { width: wd + "%" };
                const avg = m.diverge ? 50 + (m.league / max) * 50 : (m.league / max) * 100;
                return (
                  <div key={it.id} className={"tbar" + (m.bestId === it.id ? " best" : "")}><b>{it.name}</b>
                    <div className="tbar-track">{m.diverge && <span className="tbar-zero" />}<span className="tbar-fill" style={style} /><span className="tbar-avg" style={{ left: avg + "%" }} /></div>
                    <span className="v">{it.display}</span></div>
                );
              })}
            </div>
          );
        })}
        <p className="legend"><i style={{ background: "#1d3fbb" }} />가장 좋은 기록 <i style={{ background: "#8d9ab8", marginLeft: 12 }} />그 밖의 팀 <i style={{ background: "#c8302a", marginLeft: 12, width: 3 }} />리그 평균</p></section>
    </>
  );
}

/** 분석 결과: 저장된 결과 요약으로 그린다 (분석 당시와 같은 값이 나오게 하려고 다시 계산하지 않는다) */
function ResultInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [rec, setRec] = useState(() => Store.get(id));
  const [loaded, setLoaded] = useState(!!Store.get(id));
  const [busy, setBusy] = useState(false);
  useScene(rec && (rec.type === "batter" || rec.type === "pitcher") ? rec.type : "stadium");

  // 다른 기기에서 만든 기록이면 계정에서 가져와 본다
  useEffect(() => {
    if (rec) return;
    Store.pull().then(() => { setRec(Store.get(id)); setLoaded(true); });
  }, [id, rec]);
  useEffect(() => { if (rec) document.title = rec.title + " | 야구 분석 랩"; }, [rec]);

  if (!rec) {
    if (!loaded) return <div className="wrap"><p className="sub">불러오는 중...</p></div>;
    return (
      <div className="wrap">
        <div className="err-box" role="alert"><b>이 분석 결과를 찾을 수 없습니다.</b><br />삭제되었거나 다른 브라우저에서 만든 분석일 수 있어요.</div>
        <div className="act-row"><Link className="btn" to="/history">분석 기록 보기</Link><Link className="btn pri" to="/analyze">새 분석 시작하기</Link></div>
      </div>
    );
  }
  if (rec.result.kind === "compare") return <Navigate to={rec.result.path} replace />;
  const r = rec.result;
  const sub = r.kind === "team" ? `${rec.season} 시즌, ${r.teams.map(t => t.name).join(", ")}` : `${rec.season} 시즌, ${r.teamName || r.subject.team} 소속, ${r.subject.pos} 포지션`;

  const savePdf = async () => {
    setBusy(true);
    try { await generate(rec, "save"); toast(`${fileName(rec)} 파일을 저장했습니다.`); }
    catch (err) { toast(err && err.message ? err.message : "PDF를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  const again = () => {
    Store.saveWizard({ mode: "record", source: "site", type: rec.type, season: rec.season, target: rec.params.target, teams: rec.params.teams, metrics: rec.params.metrics });
    navigate("/analyze#3");
  };

  return (
    <div className="wrap">
      <div className="result-head"><h1>{rec.title}</h1><p className="sub">{sub}. {dateKo(rec.createdAt)} 분석, KBO {rec.season} 정규시즌 실제 기록</p></div>
      {r.kind === "team" ? <TeamView rec={rec} r={r} /> : <PlayerView rec={rec} r={r} />}
      <div className="act-row">
        <button className="btn pri" type="button" disabled={busy} aria-busy={busy} onClick={savePdf}>{busy ? "보고서를 만드는 중" : "PDF로 저장"}</button>
        <button className="btn ghost" type="button" onClick={again}>조건 바꿔 다시 분석</button>
        <Link className="btn ghost" to="/history">분석 기록 보기</Link>
      </div>
    </div>
  );
}

/** 결과 주소가 바뀌면(다른 기록으로 이동) 화면 상태를 새로 시작한다 */
export default function Result() {
  const { id } = useParams();
  return <ResultInner key={id} />;
}
