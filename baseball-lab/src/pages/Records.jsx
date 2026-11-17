import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Api } from "../lib/api.js";
import { Store } from "../lib/storage.js";
import { TYPES } from "../lib/stats.js";
import { useScene } from "../context/SceneContext.jsx";

/* 역대 기록: 통산 순위, 시즌 최고 기록, 선수 검색 (Kaggle KBO Player Stats 1982–2026, ml/build_history.py) */
const CAREER = {
  batter: [["HR", "홈런"], ["H", "안타"], ["RBI", "타점"], ["R", "득점"], ["SB", "도루"], ["BB", "볼넷"], ["G", "경기"], ["PA", "타석"]],
  pitcher: [["W", "승"], ["SV", "세이브"], ["SO", "탈삼진"], ["HLD", "홀드"], ["IP", "이닝"], ["G", "경기"]],
};
const SEASON = {
  batter: [["HR", "홈런"], ["H", "안타"], ["RBI", "타점"], ["SB", "도루"], ["BB", "볼넷"], ["AVG", "타율*"], ["OBP", "출루율*"], ["SLG", "장타율*"], ["OPS", "OPS*"]],
  pitcher: [["W", "승"], ["SV", "세이브"], ["SO", "탈삼진"], ["HLD", "홀드"], ["ERA", "평균자책점*"], ["WHIP", "WHIP*"], ["K9", "9이닝당 삼진*"]],
};
const f3 = v => v.toFixed(3).replace(/^0/, "");
const fmt = (k, v) => (["AVG", "OBP", "SLG", "OPS"].includes(k) ? (k === "OPS" ? v.toFixed(3) : f3(v)) : k === "ERA" || k === "WHIP" ? v.toFixed(2) : k === "K9" ? v.toFixed(1) : String(v));
const norm = s => s.toLowerCase().replace(/\s+/g, "");

export default function Records() {
  useScene("stadium");
  const navigate = useNavigate();
  const [rec, setRec] = useState(undefined), [tab, setTab] = useState("career"), [type, setType] = useState("batter"), [key, setKey] = useState("HR"), [q, setQ] = useState("");
  useEffect(() => { document.title = "역대 기록 | 야구 분석 랩"; Api.records().then(setRec); }, []);
  const pick = t => { setType(t); setKey((tab === "career" ? CAREER : SEASON)[t][0][0]); };
  const pickTab = t => { setTab(t); if (t !== "search") setKey((t === "career" ? CAREER : SEASON)[type][0][0]); };

  const analyze = (pid, season, t = type) => { Store.saveWizard({ mode: "record", source: "site", type: t, season, target: pid, teams: [], metrics: t === "batter" ? ["AVG", "OPS", "HR"] : ["ERA", "WHIP", "K9"] }); navigate("/analyze#3"); };
  const list = rec ? (rec[tab === "career" ? "career" : "season"][type][key] || []) : [];
  const shown = useMemo(() => { const n = norm(q); return n ? list.filter(r => norm(r[1]).includes(n) || norm(r[2]).includes(n)) : list; }, [list, q]);
  const lowBest = key === "ERA" || key === "WHIP";

  return (
    <div className="wrap">
      <div className="result-head"><h1>역대 기록</h1><p className="sub">KBO 1982~2026 시즌 기록으로 만든 통산 순위와 시즌 최고 기록입니다. 행의 "분석" 버튼을 누르면 그 시즌을 바로 분석할 수 있어요.</p></div>
      <div className="seg3" role="group" aria-label="보기 방식">
        {[["career", "통산 순위"], ["season", "시즌 최고 기록"], ["search", "선수 기록 검색"]].map(([k, l]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => pickTab(k)}>{l}</button>)}
      </div>
      {tab !== "search" && <>
        <div className="seg2" role="group" aria-label="선수 종류" style={{ margin: "14px 0 8px", maxWidth: 260 }}>
          {[["batter", "타자"], ["pitcher", "투수"]].map(([k, l]) => <button key={k} type="button" aria-pressed={type === k} onClick={() => pick(k)}>{l}</button>)}
        </div>
        <div className="chips" role="group" aria-label="기록 종류">
          {(tab === "career" ? CAREER : SEASON)[type].map(([k, l]) => <button key={k} className="chip" type="button" aria-pressed={key === k} onClick={() => setKey(k)}>{l}</button>)}
        </div>
        {rec === undefined && <p className="sub">불러오는 중...</p>}
        {rec === null && <div className="err-box" role="alert">역대 기록 파일을 불러오지 못했습니다.</div>}
        {rec && <>
          <div className="rec-tools"><label className="label" htmlFor="rq">이름이나 팀으로 거르기</label><input id="rq" className="field" type="search" placeholder={`예: ${type === "batter" ? "이승엽" : "선동열"}, 삼성`} value={q} onChange={e => setQ(e.target.value)} /></div>
          <div className="table-wrap"><table className="rec-t">
            <thead><tr><th>순위</th><th>선수</th><th>팀</th>{tab === "career" ? <><th>{(CAREER[type].find(x => x[0] === key) || [])[1]}</th><th>활동 기간</th></> : <><th>{(SEASON[type].find(x => x[0] === key) || [])[1].replace("*", "")}</th><th>시즌</th></>}<th>분석</th></tr></thead>
            <tbody>{shown.map(r => {
              const rank = list.indexOf(r) + 1, season = tab === "career" ? r[5] : r[3];
              return <tr key={rank + r[0]}><td>{rank}</td><td><b>{r[1]}</b>{tab === "career" && r[5] === rec.meta.last ? <span className="pill act">현역</span> : null}</td><td>{r[2]}</td>
                {tab === "career" ? <><td>{fmt(key, r[3])}</td><td>{r[4]}~{r[5]}</td></> : <><td>{fmt(key, r[4])}</td><td>{r[3]}</td></>}
                <td><button className="btn small" type="button" onClick={() => analyze(r[0], season)}>{season} 분석</button></td></tr>;
            })}</tbody></table></div>
          {!shown.length && <p className="sub">조건에 맞는 선수가 없어요. 목록은 각 기록의 상위 100위까지예요.</p>}
          <p className="note">{rec.meta.note}{tab === "season" && " 이름 뒤 * 표시가 있는 기록이 규정을 채운 선수 기록입니다."}{lowBest && " 낮을수록 좋은 기록이라 낮은 순서로 정렬했어요."} 통산은 KBO 1군 기록이며 상위 100위까지 보여 줍니다. 출처: Kaggle <i>KBO Player Stats 1982–2026</i> (netsong, CC BY-NC-SA 4.0).</p>
        </>}
      </>}
      {tab === "search" && <Search analyze={analyze} />}
    </div>
  );
}

/** 선수 기록 검색: 이름으로 찾아 시즌별 기록을 보고, 시즌을 골라 바로 분석한다 */
function Search({ analyze }) {
  const [all, setAll] = useState(undefined), [q, setQ] = useState(""), [who, setWho] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.all([Api.csv("batters_hist"), Api.csv("pitchers_hist"), Api.csv("batters"), Api.csv("pitchers")]).then(([bh, ph, b, p]) => {
      if (!live) return;
      const idx = new Map();
      const add = (rows, type) => rows.forEach(r => { const k = type + r.pid; if (!idx.has(k)) idx.set(k, { key: k, pid: r.pid, type, name: r.name, rows: [] }); const e = idx.get(k); e.name = r.name; e.rows.push(r); });
      add(bh, "batter"); add(b, "batter"); add(ph, "pitcher"); add(p, "pitcher");
      setAll([...idx.values()]);
    }).catch(() => { if (live) setAll(null); });
    return () => { live = false; };
  }, []);
  const hits = useMemo(() => { const n = norm(q); return all && n.length >= 1 ? all.filter(e => norm(e.name).includes(n)).sort((a, b) => b.rows.length - a.rows.length).slice(0, 30) : []; }, [all, q]);
  const def = (t, k) => TYPES[t].defs.find(d => d.key === k);
  return (
    <div style={{ marginTop: 14 }}>
      <label className="label" htmlFor="sq">선수 이름</label>
      <input id="sq" className="field" type="search" placeholder="예: 이종범, 류현진, 최정" value={q} onChange={e => { setQ(e.target.value); setWho(null); }} />
      {all === undefined && <p className="sub">기록을 불러오는 중...</p>}
      {all === null && <div className="err-box" role="alert">기록을 불러오지 못했습니다.</div>}
      {!who && hits.length > 0 && <ul className="plain rec-hits">{hits.map(e => <li key={e.key}><button className="linkbtn" type="button" onClick={() => setWho(e)}>{e.name}</button> <span className="sub">{e.type === "batter" ? "타자" : "투수"} · {e.rows[0].season}~{e.rows[e.rows.length - 1].season} · {e.rows.length}시즌</span></li>)}</ul>}
      {!who && all && q && !hits.length && <p className="sub">이름이 일치하는 선수가 없어요. 이름 일부만 입력해 보세요.</p>}
      {who && <>
        <h2 style={{ marginTop: 18 }}>{who.name} <small className="sub">{who.type === "batter" ? "타자" : "투수"} 시즌별 기록</small></h2>
        <div className="table-wrap"><table className="rec-t">
          <thead><tr>{(who.type === "batter" ? ["시즌", "팀", "경기", "타석", "타율", "OPS", "홈런", "타점"] : ["시즌", "팀", "경기", "이닝", "ERA", "WHIP", "탈삼진"]).map(h => <th key={h}>{h}</th>)}<th>분석</th></tr></thead>
          <tbody>{who.rows.slice().sort((a, b) => b.season - a.season).map(r => {
            const v = k => { const x = def(who.type, k).calc(r); return x == null ? "-" : def(who.type, k).fmt(x); };
            return <tr key={r.season}><td>{r.season}</td><td>{r.team}</td><td>{r.g}</td>
              {who.type === "batter" ? <><td>{r.pa}</td><td>{v("AVG")}</td><td>{v("OPS")}</td><td>{r.hr}</td><td>{r.rbi}</td></> : <><td>{(r.outs / 3).toFixed(1)}</td><td>{v("ERA")}</td><td>{v("WHIP")}</td><td>{r.so}</td></>}
              <td><button className="btn small" type="button" onClick={() => analyze(r.pid, r.season, who.type)}>{r.season} 분석</button></td></tr>;
          })}</tbody></table></div>
        <button className="btn ghost small" type="button" onClick={() => setWho(null)}>검색 결과로 돌아가기</button>
      </>}
    </div>
  );
}
