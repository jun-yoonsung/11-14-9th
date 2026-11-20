import { Link, Navigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { TYPES } from "../lib/stats.js";
import { generate, fileName, ipText } from "../lib/report.js";
import { dateKo, topText } from "../lib/format.js";
import { useRecord, useReport } from "../lib/useRecord.js";
import DetailReport from "../components/DetailReport.jsx";
import SimilarPlayers from "../components/SimilarPlayers.jsx";
import Forecast from "../components/Forecast.jsx";
import Spray from "../components/Spray.jsx";
import Career from "../components/Career.jsx";
import TeamSpray from "../components/TeamSpray.jsx";
import TeamExtras from "../components/TeamExtras.jsx";
import { useScene } from "../context/SceneContext.jsx";
import { useToast } from "../context/ToastContext.jsx";

const RAW = {
  batter: [["g", "경기"], ["pa", "타석"], ["ab", "타수"], ["h", "안타"], ["d2", "2루타"], ["d3", "3루타"], ["hr", "홈런"], ["rbi", "타점"], ["r", "득점"], ["bb", "볼넷"], ["hbp", "사구"], ["so", "삼진"], ["sf", "희생플라이"]],
  pitcher: [["g", "경기"], ["gs", "선발"], ["ip", "이닝"], ["h", "피안타"], ["hr", "피홈런"], ["bb", "볼넷"], ["so", "삼진"], ["er", "자책점"], ["r", "실점"], ["pitches", "투구 수"]],
};

/** 고른 지표마다 한두 문장으로 풀어 쓴다 */
function Explain({ r, rec }) {
  const unit = rec.type === "batter" ? "타자" : "투수";
  return (
    <section className="sec rep" id="r-explain"><h2>선택한 지표 해설</h2>
      <p className="sub">고른 지표를 하나씩 문장으로 풀었어요.</p>
      <ul className="plain explain">{r.lines.map(l => {
        if (l.value == null) return <li key={l.key}><b>{l.label}</b>: 이 시즌 기록이 없어 계산하지 못했습니다.</li>;
        const rel = l.tone === "even" ? "리그 평균과 같고" : `리그 평균(${l.leagueDisplay})보다 ${l.diffDisplay}이고`;
        const pos = l.pct == null ? "규정 미달이라 순위는 매기지 않았습니다." : `규정을 채운 ${unit} 중 ${topText(l)}${l.rank ? `, ${l.rank}위` : ""}입니다.`;
        return <li key={l.key}><b>{l.label} {l.display}</b>: {rel} {pos}</li>;
      })}</ul></section>
  );
}

function PlayerDetail({ rec, r }) {
  const rep = useReport(rec);
  const raw = { ...r.raw, ip: ipText(r.raw.outs) };
  const cols = RAW[rec.type].filter(c => raw[c[0]] != null);
  return (
    <>
      {rep ? <DetailReport rep={rep} /> : <p className="sub">상세 보고서를 만드는 중...</p>}
      <SimilarPlayers rec={rec} />
      <Spray rec={rec} />
      <Career rec={rec} />
      <Forecast rec={rec} />
      <Explain r={r} rec={rec} />
      <section className="sec rep" id="r-raw"><h2>기록 원자료</h2>
        <div className="table-wrap"><table><thead><tr>{cols.map(c => <th key={c[0]}>{c[1]}</th>)}</tr></thead><tbody><tr>{cols.map(c => <td key={c[0]}>{raw[c[0]]}</td>)}</tr></tbody></table></div></section>
    </>
  );
}

function TeamDetail({ rec, r }) {
  return (
    <>
      <TeamExtras rec={rec} />
      <TeamSpray rec={rec} />
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

/** 자세하게 보기: 요약에서 다룬 내용을 가능한 한 전부 펼쳐 보여 준다 */
function Inner() {
  const { id } = useParams();
  const toast = useToast();
  const { rec, loaded } = useRecord(id);
  const [busy, setBusy] = useState(false);
  useScene(rec && (rec.type === "batter" || rec.type === "pitcher") ? rec.type : "stadium");
  useEffect(() => { if (rec) document.title = rec.title + " 자세히 | 야구 분석 랩"; }, [rec]);
  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  if (!rec) {
    if (!loaded) return <div className="wrap"><p className="sub">불러오는 중...</p></div>;
    return <div className="wrap"><div className="err-box" role="alert"><b>이 분석 결과를 찾을 수 없습니다.</b></div><div className="act-row"><Link className="btn" to="/history">분석 기록 보기</Link></div></div>;
  }
  if (rec.result.kind === "compare") return <Navigate to={rec.result.path} replace />;
  const r = rec.result;
  const savePdf = async () => {
    setBusy(true);
    try { await generate(rec, "save"); toast(`${fileName(rec)} 파일을 저장했습니다.`); }
    catch (err) { toast(err && err.message ? err.message : "PDF를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  return (
    <div className="wrap">
      <Link className="back-link" to={`/result/${rec.id}`}>요약으로 돌아가기</Link>
      <div className="result-head"><h1>{rec.title} 자세히 보기</h1><p className="sub">{rec.season} 시즌, {dateKo(rec.createdAt)} 분석. 요약에 없던 내용까지 모두 담았어요.</p></div>
      {r.kind === "team" ? <TeamDetail rec={rec} r={r} /> : <PlayerDetail rec={rec} r={r} />}
      <div className="act-row">
        <button className="btn pri" type="button" disabled={busy} aria-busy={busy} onClick={savePdf}>{busy ? "보고서를 만드는 중" : "PDF로 저장"}</button>
        <Link className="btn ghost" to={`/result/${rec.id}`}>요약으로 돌아가기</Link>
        <Link className="btn ghost" to="/history">분석 기록 보기</Link>
      </div>
    </div>
  );
}

export default function ResultDetail() {
  const { id } = useParams();
  return <Inner key={id} />;
}
