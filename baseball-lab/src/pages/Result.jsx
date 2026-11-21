import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Store } from "../lib/storage.js";
import { TYPES } from "../lib/stats.js";
import { generate, fileName } from "../lib/report.js";
import { dateKo } from "../lib/format.js";
import { useRecord, useReport } from "../lib/useRecord.js";
import PctBlock from "../components/PctBlock.jsx";
import AiCommentary from "../components/AiCommentary.jsx";
import { ListCard } from "../components/DetailReport.jsx";
import { useScene } from "../context/SceneContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { useEffect, useState } from "react";

const kpiNote = l => (l.value == null ? "기록 없음" : l.tone === "even" ? "리그 평균과 같음" : `리그보다 ${l.diffDisplay}`);

const PLAYER_PARTS = ["종합 평가·강점과 보완점", "능력 프로필", "지표 전체 표와 계산식", "월별 추이", "비슷한 선수", "타구 방향(2026 시즌)", "투구 존·구종 무브먼트·볼카운트·상황별 성적·득점/승리 기여(2026 시즌)", "공 가치·매치업 예상·공 연결·부하·타구 유형(2026 시즌)", "통산 커리어", "앞으로 5년 예측", "지표별 해설", "기록 원자료"];

/** 요약 아래의 "자세하게 보기" 안내 */
function MoreCard({ id, parts, label }) {
  return (
    <section className="more-card" aria-label="자세하게 보기">
      <div>
        <h2>{label}</h2>
        <p className="sub">요약에서 다룬 내용을 지표 하나하나까지 풀어서 보여 드려요. 아래 내용이 들어 있습니다.</p>
        <ul className="more-list">{parts.map(x => <li key={x}>{x}</li>)}</ul>
      </div>
      <Link className="btn pri more-btn" to={`/result/${id}/detail`}>자세하게 보기</Link>
    </section>
  );
}

function PlayerSummary({ rec, r }) {
  const rep = useReport(rec);
  const TY = TYPES[rec.type];
  const parts = PLAYER_PARTS.filter(x => !(x === "월별 추이" && rep && !rep.trend) && !(x.startsWith("타구 방향") && rec.season !== 2026));
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
      {rep && (
        <section className="sec"><h2>한눈에 보는 강점과 보완점</h2>
          <p className="headline" dangerouslySetInnerHTML={{ __html: rep.headline }} />
          <div className="two-cards"><ListCard title="강점" cls="pos" list={rep.strengths.slice(0, 3)} /><ListCard title="보완할 점" cls="neg" list={rep.weaknesses.slice(0, 3)} /></div></section>
      )}
      <MoreCard id={rec.id} parts={parts} label="더 자세히 알고 싶다면" />
    </>
  );
}

function TeamSummary({ rec, r }) {
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
      <MoreCard id={rec.id} parts={["지표별 막대 비교(리그 평균선 포함)", "팀 역대 요약과 순위 흐름", ...(rec.season === 2026 ? ["타구로 본 팀(타선·수비·구장)", "상황별 성적과 득점·승리 기여", "타순·라인업 시뮬레이션·팀 Elo와 경기 예측"] : [])]} label="더 자세히 알고 싶다면" />
    </>
  );
}

/** 분석 결과: 저장된 결과 요약으로 그린다 (분석 당시와 같은 값이 나오게 하려고 다시 계산하지 않는다) */
function ResultInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { rec, loaded } = useRecord(id);
  const [busy, setBusy] = useState(false);
  useScene(rec && (rec.type === "batter" || rec.type === "pitcher") ? rec.type : "stadium");

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
      {r.kind === "team" ? <TeamSummary rec={rec} r={r} /> : <PlayerSummary rec={rec} r={r} />}
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
