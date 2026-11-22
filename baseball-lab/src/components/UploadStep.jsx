import { useMemo, useRef, useState } from "react";
import { Api } from "../lib/api.js";
import { Store } from "../lib/storage.js";
import { TYPES, analyzePlayer } from "../lib/stats.js";
import { qualFor, usableDefs, teamLabel } from "../lib/season.js";
import MetricChip from "./MetricChip.jsx";
import { MAX_BYTES, readPlayers, TEMPLATES } from "../lib/upload.js";

const download = (name, text) => {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** 데이터 분석 ③ (내 데이터 업로드): 파일 읽기 → 선수 고르기 → 지표 고르기 → KBO 리그 기록과 비교. 파일은 이 브라우저 안에서만 읽는다. */
export default function UploadStep({ w, update, meta, go, navigate }) {
  const seasons = (meta.allSeasons || meta.seasons).slice().sort((a, b) => b - a), season0 = seasons.includes(w.season) ? w.season : seasons[0];   // 저장돼 있던 시즌이 목록에 없으면 최신
  const type = w.type === "pitcher" ? "pitcher" : "batter", ty = TYPES[type];
  const defs = useMemo(() => usableDefs(type, ty.defs), [type, ty.defs]);
  const [file, setFile] = useState(null), [parsed, setParsed] = useState(null), [pid, setPid] = useState(""), [metrics, setMetrics] = useState(() => ty.defaults.slice());
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [drag, setDrag] = useState(false);
  const input = useRef(null);

  const reset = () => { setFile(null); setParsed(null); setPid(""); setErr(""); };
  const setType = k => { update({ type: k, target: "" }); setMetrics(TYPES[k].defaults.slice()); reset(); };
  const load = async f => {
    reset(); if (!f) return;
    if (f.size > MAX_BYTES) { setErr(`파일이 너무 커요(${(f.size / 1048576).toFixed(1)}MB). 2MB 이하로 줄여 주세요.`); return; }
    if (!/\.(csv|tsv|txt)$/i.test(f.name)) { setErr("CSV 파일(.csv)만 올릴 수 있어요. 엑셀에서는 '다른 이름으로 저장 → CSV'로 저장해 주세요."); return; }
    const res = readPlayers(await f.text(), type);
    setFile(f); setParsed(res); if (res.players.length) setPid(res.players[0].pid);
  };
  const toggle = k => setMetrics(m => (m.includes(k) ? m.filter(x => x !== k) : [...m, k]));

  async function run() {
    if (!parsed?.players.length) return setErr("먼저 기록 파일을 올려 주세요.");
    if (!pid) return setErr(`${ty.short}를 선택해 주세요.`);
    if (!metrics.length) return setErr("지표를 1개 이상 선택해 주세요.");
    setErr(""); setBusy(true);
    try {
      const season = season0, league = await (type === "batter" ? Api.batters(season) : Api.pitchers(season));
      const me = { ...parsed.players.find(p => p.pid === pid), season };
      if (type === "pitcher" && !league.some(r => r.pos)) delete me.pos;   // 과거 시즌 기록에는 선발·구원 구분이 없어 모두 "투수"로 함께 비교
      const result = analyzePlayer(type, [...league, me], me.pid, metrics.filter(k => defs.some(d => d.key === k)), qualFor(meta, season));
      result.teamName = me.team;
      const rec = {
        id: Store.newId(), createdAt: new Date().toISOString(), mode: "record", source: "upload", type, season, title: `${me.name} 내 기록 ${ty.label}`,
        params: { target: me.pid, teams: [], metrics: metrics.slice() }, result,
      };
      Store.add(rec); navigate(`/result/${encodeURIComponent(rec.id)}`);
    } catch (e) { console.warn(e); setErr("분석하지 못했어요. 파일을 다시 확인해 주세요."); setBusy(false); }
  }

  return (
    <div className="panel">
      <h1>내 기록을 분석할까요?</h1>
      <p className="sub">가지고 있는 기록 파일(CSV)을 올리면 KBO 정규시즌 기록과 비교해 보여 드려요. 파일은 서버로 올라가지 않고 이 브라우저 안에서만 읽어요.</p>
      <div className="seg" role="group" aria-label="분석 종류">
        {["batter", "pitcher"].map(k => <button key={k} type="button" aria-pressed={type === k} onClick={() => type !== k && setType(k)}>{TYPES[k].short}</button>)}
      </div>
      <div className="row2">
        <div><label className="label" htmlFor="upSeason">비교할 KBO 시즌</label>
          <select className="field" id="upSeason" value={season0} onChange={e => update({ season: Number(e.target.value) })}>
            {seasons.map(s => <option key={s} value={s}>{s}{s === meta.seasons[0] ? " (최신)" : ""}</option>)}
          </select>
          <p className="hint">올린 선수를 이 시즌의 규정 채운 {ty.noun}들과 비교해요.</p></div>
        <div><span className="label">기록 파일</span>
          <div className={"drop up" + (drag ? " on" : "")} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); load(e.dataTransfer.files[0]); }}>
            <button className="btn" type="button" onClick={() => input.current?.click()}>{file ? "다른 파일 고르기" : "파일 고르기"}</button>
            <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" hidden aria-label="기록 파일" onChange={e => { load(e.target.files[0]); e.target.value = ""; }} />
            <span className="fname">{file ? file.name : "여기로 끌어 놓아도 돼요"}</span>
          </div>
          <p className="hint">첫 줄은 열 이름이에요. <button className="linkbtn" type="button" onClick={() => download(`예시_${ty.short}_기록.csv`, TEMPLATES[type])}>예시 파일 내려받기</button></p></div>
      </div>

      {parsed && (
        <div aria-live="polite">
          {parsed.errors.length > 0 && <div className="note warn" role="alert"><b>확인이 필요해요</b><ul>{parsed.errors.slice(0, 8).map(x => <li key={x}>{x}</li>)}{parsed.errors.length > 8 && <li>그 밖에 {parsed.errors.length - 8}건 더 있어요.</li>}</ul></div>}
          {parsed.warnings.length > 0 && <div className="note" role="note"><ul>{parsed.warnings.map(x => <li key={x}>{x}</li>)}</ul></div>}
          {parsed.players.length > 0 && <>
            <p className="ok-line">{parsed.players.length}명을 읽었어요{parsed.errors.length ? `(${parsed.errors.length}건은 빼고)` : ""}.</p>
            <div className="row2"><div><label className="label" htmlFor="upPlayer">분석할 {ty.short}</label>
              <select className="field" id="upPlayer" value={pid} onChange={e => setPid(e.target.value)}>
                {parsed.players.map(p => <option key={p.pid} value={p.pid}>{p.name}{p.team && p.team !== "내 팀" ? ` · ${p.team}` : ""}</option>)}
              </select></div></div>
            <div><span className="label">볼 지표 <span className="count">{metrics.length} / {defs.length}개 선택</span></span>
              <div className="metric-tools">
                <button className="btn small ghost" type="button" onClick={() => setMetrics(ty.defaults.slice())}>기본 지표만</button>
                <button className="btn small ghost" type="button" onClick={() => setMetrics(defs.map(d => d.key))}>전체 선택</button>
              </div>
              <div className="chips">{defs.map(d => <MetricChip key={d.key} def={d} type={type} pressed={metrics.includes(d.key)} onToggle={() => toggle(d.key)} />)}</div>
              <p className="hint">파일의 공식 기록으로 계산할 수 있는 지표만 보여요(투구 추적 지표 제외).</p></div>
          </>}
        </div>
      )}
      <div className="err-msg" role="alert">{err}</div>
      <div className="actions">
        <button className="btn ghost" type="button" onClick={() => go(2)}>이전</button>
        <button className="btn pri grow" type="button" disabled={busy || !parsed?.players.length} aria-busy={busy} onClick={run}>{busy ? "분석하는 중" : "분석하기"}</button>
      </div>
    </div>
  );
}
