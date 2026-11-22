import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Api } from "../lib/api.js";
import { Store } from "../lib/storage.js";
import { loadLandmarker, openVideo, scan, detectFps, fineFps, needsTrim, MAX_UNTRIMMED_SEC } from "../lib/pose.js";
import { pickPerson, soleSeed, follow, detectHand, suggestWindow, detectSide, suggestSwingWindow, center, cropRect, adjustClip, sampleTimes, wholeClip } from "../lib/segment.js";
import { T } from "../lib/formLabels.js";
import { buildResult, buildRecord } from "../lib/formRecord.js";
import { useScene } from "../context/SceneContext.jsx";
import { useToast } from "../context/ToastContext.jsx";

const VIEWS = {
  pitching: [["side", "옆에서", "투수의 옆모습(1루나 3루 쪽)"], ["front", "정면", "투수가 나를 향해 던짐(타자 쪽 시점)"], ["back", "뒤에서", "투수 뒤(포수 뒤쪽 반대, 외야 쪽)"], ["broadcast", "중계 화면", "중계처럼 뒤쪽 높은 곳에서 비스듬히"]],
  hitting: [["side", "옆에서", "타자의 옆모습(타석 옆, 1루나 3루 쪽)"], ["front", "정면", "타자가 나를 향함(투수 쪽에서 본 시점)"], ["back", "뒤에서", "타자 뒤(포수 쪽에서 본 시점)"], ["broadcast", "중계 화면", "중계처럼 뒤쪽 높은 곳에서 비스듬히"]],
};
const COARSE_FPS = 5, MAX_CLIP_S = 60, SOFT_CLIP_S = 8, MIN_CLIP_S = 0.8;   // 끝 구간은 사용자가 정한다. 60초는 브라우저가 멈추지 않게 하는 안전 상한이고, 8초부터는 오래 걸린다고 알려 준다
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** 영상 분석 (투구 폼): 올리기 → 시점·키 → 사람 고르기 → 구간 고르기 → 3D 분석 → 결과. 영상은 이 브라우저 안에서만 처리한다. */
export default function VideoLab() {
  useScene("stadium");
  const nav = useNavigate(), toast = useToast();
  const [sp, setSp] = useSearchParams(), sport = sp.get("sport") === "hitting" ? "hitting" : "pitching", tx = T(sport), hit = sport === "hitting";
  const [stage, setStage] = useState("pick");       // pick | loading | setup | person | scan | window | final
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);           // {name, duration}
  const [view, setView] = useState("side");
  const [height, setHeight] = useState("");
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [persons, setPersons] = useState([]);
  const [progress, setProgress] = useState(0);
  const [win, setWin] = useState(null);             // {start,end,release,confidence}|null
  const [hand, setHand] = useState("R");
  const [note, setNote] = useState("");
  const [m, setM] = useState(null);                // 고른 구간 {start,end}
  const host = useRef(null), S = useRef({});
  useEffect(() => { document.title = "영상 분석 | 야구 분석 랩"; return () => { S.current.abort?.abort(); S.current.vid?.close(); }; }, []);
  useEffect(() => { const v = S.current.vid?.video; if (v && host.current && !host.current.contains(v)) { v.className = "vl-video"; v.controls = true; host.current.prepend(v); } });

  const fail = (e, fallback) => { console.error("[영상 분석]", e); setErr(e?.message === "UNPLAYABLE" ? "UNPLAYABLE" : fallback || "분석 중 문제가 생겼어요. 다시 시도해 주세요."); setStage("pick"); };

  const onFile = async file => {
    if (!file) return;
    setErr(null); setStage("loading"); S.current.vid?.close();
    try {
      const vid = await openVideo(file);
      if (!Number.isFinite(vid.duration) || vid.duration < MIN_CLIP_S) { vid.close(); throw new Error("SHORT"); }
      S.current.vid = vid; S.current.fps = fineFps(await detectFps(vid.video)); setInfo({ name: file.name, duration: vid.duration });
      setRange({ start: 0, end: Math.min(vid.duration, MAX_UNTRIMMED_SEC) }); setStage("setup");
    } catch (e) { fail(e, e.message === "SHORT" ? "영상이 너무 짧거나 길이를 알 수 없어요. 투구 한 번이 담긴 영상(1초 이상)을 골라 주세요." : null); }
  };

  const ensureLm = async () => { if (!S.current.lm) { setNote("관절 인식 모델을 불러오는 중이에요 (처음 한 번, 약 30MB)"); S.current.lm = await loadLandmarker(); setNote(""); } return S.current.lm; };

  const toPerson = async () => {
    const span = Math.round((range.end - range.start) * 100) / 100;
    if (span < MIN_CLIP_S) return setErr("분석할 범위가 너무 짧아요. 시작과 끝을 조정해 주세요.");
    if (span > MAX_UNTRIMMED_SEC + 0.01) return setErr(`한 번에 ${MAX_UNTRIMMED_SEC / 60}분까지만 훑을 수 있어요. 범위를 줄여 주세요.`);
    setErr(null); setStage("loading");
    try {
      const lm = await ensureLm(); let all = [];
      for (const t of sampleTimes(range.start, range.end, 6)) {   // 시작 장면에 사람이 없어도(광고·컷) 범위 안 다른 장면에서 찾는다
        const fr = await scan(lm, S.current.vid.video, { from: t, to: t, fps: 1 }); all = fr[0]?.all || [];
        if (all.length) break;
      }
      if (!all.length) { setErr("이 범위에서 사람을 찾지 못했어요. 사람이 보이는 장면이 들어가도록 시작·끝을 옮겨 보세요."); setStage("setup"); return; }
      setPersons(all.map(p => p.img));
      const sole = soleSeed(all);
      if (sole) { S.current.seed = sole; runCoarse(); } else setStage("person");
    } catch (e) { fail(e); }
  };

  const choose = i => { S.current.seed = center(persons[i]); runCoarse(); };

  const runCoarse = async () => {
    setStage("scan"); setProgress(0); setErr(null);
    const ab = new AbortController(); S.current.abort = ab;
    try {
      const fr = await scan(S.current.lm, S.current.vid.video, { from: range.start, to: range.end, fps: COARSE_FPS, signal: ab.signal, onProgress: setProgress });
      if (ab.signal.aborted) { setStage("setup"); return; }
      const first = pickPerson(fr[0], S.current.seed[0], S.current.seed[1]);
      let flw = follow(fr, first < 0 ? 0 : first);
      const v = S.current.vid.video, box = /[?&]crop=0/.test(location.href) ? null : cropRect(flw, { aspect: v.videoWidth / v.videoHeight });   // ?crop=0 은 확대 없이 비교하는 시험용
      S.current.crop = null;
      if (box) {   // 사람이 작다 → 움직이는 범위만 확대해 다시 훑는다
        const c0 = center(flw.find(f => f.img).img);
        const fr2 = await scan(S.current.lm, v, { from: range.start, to: range.end, fps: COARSE_FPS, signal: ab.signal, onProgress: setProgress, crop: box });
        if (ab.signal.aborted) { setStage("setup"); return; }
        const f2 = follow(fr2, Math.max(0, pickPerson(fr2[0], c0[0], c0[1])));
        if (f2.filter(f => f.j).length >= flw.filter(f => f.j).length) { flw = f2; S.current.crop = box; }
      }
      const h = hit ? detectSide(flw) : detectHand(flw), w = hit ? suggestSwingWindow(flw, COARSE_FPS) : suggestWindow(flw, h, COARSE_FPS);
      S.current.coarse = flw; setHand(h); setWin(w);
      if (!w) setNote("찾지 못했어요. 막대로 직접 골라 주세요.");
      else setNote("");
      setM(w ? { start: +w.start.toFixed(1), end: +w.end.toFixed(1) } : { start: range.start, end: Math.min(range.end, range.start + 2.5) });
      setStage("window");
    } catch (e) { fail(e); }
  };

  const setClip = (k, v) => {
    const nm = adjustClip(m, k, v, range, { min: MIN_CLIP_S, max: MAX_CLIP_S }); setM(nm); setErr(null);
    const vv = S.current.vid?.video; if (vv) vv.currentTime = nm[k];
  };   // 막대를 움직이면 그 장면을 미리 보여 준다

  const runFinal = async () => {
    const len = Math.round((m.end - m.start) * 100) / 100;   // 4.8-4.0이 0.7999…로 계산돼 0.8초 구간이 "너무 짧다"고 막히지 않게 반올림
    if (len < MIN_CLIP_S) return setErr("구간이 너무 짧아요 (0.8초 이상).");
    if (len > MAX_CLIP_S) return setErr(`구간이 너무 길어요 (${MAX_CLIP_S}초 이하). 브라우저가 감당할 수 있는 길이까지만 분석해요.`);
    setErr(null); setStage("final"); setProgress(0);
    const ab = new AbortController(); S.current.abort = ab;
    try {
      const [ref, model] = await Promise.all(hit ? [Api.hitRef(), Api.hitModel()] : [Api.formRef(), Api.formModel()]);
      if (!ref) throw new Error("REF");
      const near = S.current.coarse.reduce((b, f) => (f.img && Math.abs(f.t - m.start) < Math.abs(b.t - m.start) ? f : b), S.current.coarse.find(f => f.img) || S.current.coarse[0]);
      const fr = await scan(S.current.lm, S.current.vid.video, { from: m.start, to: m.end, fps: S.current.fps || 30, signal: ab.signal, onProgress: setProgress, crop: S.current.crop });
      if (ab.signal.aborted) { setStage("window"); return; }
      const c = near.img ? center(near.img) : S.current.seed, flw = follow(fr, Math.max(0, pickPerson(fr[0], c[0], c[1])));
      const heightCm = Number(height) >= 120 && Number(height) <= 230 ? Number(height) : null;
      const result = buildResult(flw, { view, hand, heightCm, ref, model, sport });
      const rec = buildRecord({ id: Store.newId(), params: { view, hand, heightCm, clip: { start: +m.start.toFixed(2), end: +m.end.toFixed(2) } }, result, sport });
      Store.add(rec); toast("분석을 마쳤습니다. 결과 화면으로 이동해요.");
      nav(`/result/${encodeURIComponent(rec.id)}`);
    } catch (e) { fail(e, e.message === "REF" ? "참조 데이터를 불러오지 못했어요. 인터넷 연결을 확인해 주세요." : null); }
  };

  const cancel = () => S.current.abort?.abort();

  return (
    <div className="wrap vl">
      <h1>영상으로 {tx.name} 분석</h1>
      <fieldset className="seg2" role="group" aria-label="분석 종목"><legend className="sr">분석 종목</legend>
        <button type="button" aria-pressed={!hit} onClick={() => setSp({})} disabled={stage !== "pick"}>투구 폼</button><button type="button" aria-pressed={hit} onClick={() => setSp({ sport: "hitting" })} disabled={stage !== "pick"}>타격 자세</button></fieldset>
      <p className="sub">영상은 이 브라우저에만 있고 서버로 올라가지 않습니다. 영상에서 관절을 3D로 추정해 몸을 쓰는 방식을 보여 주고, 조정해 볼 방향을 알려 줍니다.</p>
      {err === "UNPLAYABLE" ? (
        <div className="err-box" role="alert"><b>이 브라우저가 재생하지 못하는 영상이에요.</b><br />아이폰·카메라가 HEVC(H.265)로 저장한 영상일 수 있어요. 휴대폰 설정에서 카메라 형식을 "호환성 우선"으로 바꿔 다시 찍거나, 영상을 MP4(H.264)로 내보내 다시 올려 주세요. 사파리에서는 HEVC가 열리는 경우가 있습니다.</div>
      ) : err && stage !== "window" && stage !== "setup" && <div className="err-box" role="alert">{err}</div>}
      {note && <p className="note" role="status">{note}</p>}

      <div className="vl-stage" hidden={!info}><div ref={host} className="vl-host">
        {stage === "person" && <div className="vl-over" role="group" aria-label="분석할 사람 고르기">{persons.map((img, i) => {
          const xs = Object.values(img).map(p => p.x), ys = Object.values(img).map(p => p.y), x0 = Math.min(...xs) - 0.03, x1 = Math.max(...xs) + 0.03, y0 = Math.min(...ys) - 0.08, y1 = Math.max(...ys) + 0.04;
          return <button key={i} type="button" className="vl-box" style={{ left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` }} aria-label={`사람 ${i + 1} 선택`} onClick={() => choose(i)}><span>{i + 1}</span></button>;
        })}</div>}
      </div></div>

      {(stage === "pick" || stage === "loading") && (
        <label className={"vl-drop" + (stage === "loading" ? " busy" : "")} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}>
          <input type="file" accept="video/*" onChange={e => onFile(e.target.files?.[0])} disabled={stage === "loading"} />
          <b>{stage === "loading" ? "영상을 여는 중..." : "영상 파일을 끌어 놓거나 눌러서 고르세요"}</b>
          <span>내가 직접 찍은 영상이나 중계 영상 모두 괜찮아요. {hit ? "타자" : "투구하는 사람"} 전체가 보이고 카메라가 고정된 영상이 가장 잘 맞아요. 큰 파일(1GB 넘는 것)도 통째로 읽지 않고 필요한 장면만 건너뛰며 봅니다.</span>
        </label>
      )}

      {stage === "setup" && info && (
        <div className="panel">
          <p className="sub"><b>{info.name}</b> · 길이 {mmss(info.duration)}</p>
          <fieldset className="vl-views"><legend>카메라가 어디에서 찍었나요?</legend>
            {VIEWS[sport].map(([k, l, d]) => <label key={k} className={"option" + (view === k ? " sel" : "")}><input type="radio" name="view" value={k} checked={view === k} onChange={() => setView(k)} /><span><b>{l}</b><small>{d}</small></span></label>)}
            <p className="note">잘 모르겠으면 "중계 화면"을 고르세요. 시점마다 믿을 수 있는 지표가 달라서 고른 시점에 맞춰 판단합니다.</p></fieldset>
          <label className="field">키(cm, 선택)<input type="number" inputMode="numeric" min="120" max="230" value={height} onChange={e => setHeight(e.target.value)} placeholder="예: 180" />
            <small>{hit ? "지금은 타격 분석에 쓰이지 않아요. 비워 두어도 됩니다." : "입력하면 릴리스 높이를 KBO 투수와 비교하는 카드가 추가돼요. 비워 두어도 됩니다."}</small></label>
          <div className="vl-range"><label>분석 시작(초)<input type="number" min="0" max={info.duration} step="0.5" value={range.start} onChange={e => { setErr(null); setRange(r => ({ ...r, start: Math.max(0, +e.target.value) })); }} /></label>
            <label>분석 끝(초)<input type="number" min="0" max={info.duration} step="0.5" value={range.end} placeholder="비우면 끝까지" onChange={e => { setErr(null); setRange(r => ({ ...r, end: e.target.value === "" ? info.duration : Math.min(info.duration, +e.target.value) })); }} /></label>
            <button className="btn small ghost" type="button" onClick={() => { setErr(null); setRange({ start: 0, end: info.duration }); }}>처음부터 끝까지</button></div>
          {range.end - range.start < MIN_CLIP_S - 0.001 && <p className="note warn" role="status">분석 끝이 분석 시작보다 {MIN_CLIP_S}초 이상 뒤여야 해요.</p>}
          {needsTrim(info.duration) && <p className="note warn">영상이 10분을 넘어요. 10분 이내로 범위를 정해 주세요. 사람이 보이는 장면에서 시작하면 좋아요.</p>}
          <p className="note">먼저 이 범위를 1초에 {COARSE_FPS}장씩 훑어 투구 구간을 찾습니다(약 {Math.max(1, Math.round((range.end - range.start) * COARSE_FPS * 0.15 / 60))}분 이상 걸릴 수 있어요).</p>
          {err && err !== "UNPLAYABLE" && <div className="err-box" role="alert">{err}</div>}
          <div className="actions"><button className="btn pri grow" type="button" onClick={toPerson}>다음: 분석할 사람 고르기</button></div>
        </div>
      )}

      {stage === "person" && <div className="panel"><p>화면에서 분석할 사람의 번호 박스를 눌러 주세요. 한 명만 보이면 자동으로 골라요.</p></div>}

      {(stage === "scan" || stage === "final") && (
        <div className="panel" role="status"><p><b>{stage === "scan" ? `${hit ? "스윙" : "투구"} 구간을 찾는 중` : "3D로 정밀 분석 중"}</b> {Math.round(progress * 100)}%</p>
          <progress max="1" value={progress} /><div className="actions"><button className="btn" type="button" onClick={cancel}>취소</button></div></div>
      )}

      {stage === "window" && m && (
        <div className="panel">
          <h2>분석할 구간</h2>
          <p className="sub">{win ? <>{hit ? "스윙으로" : "투구로"} 보이는 구간을 찾았어요 ({tx.end} 약 {win.release.toFixed(1)}초, 찾은 정도 <b>{win.confidence}</b>). 필요하면 막대로 바꿔 주세요.</> : "자동으로 찾지 못했어요. 막대로 직접 골라 주세요."} {hit ? "스윙 한 번, 앞 1.2초~뒤 0.6초가 좋아요." : "앞 1.5초~뒤 1초가 좋아요."}</p>
          <label className="field">시작 {m.start.toFixed(1)}초<input type="range" min={range.start} max={range.end} step="0.1" value={m.start} onChange={e => setClip("start", +e.target.value)} /></label>
          <label className="field">끝 {m.end.toFixed(1)}초<input type="range" min={range.start} max={range.end} step="0.1" value={m.end} onChange={e => setClip("end", +e.target.value)} /></label>
          <fieldset className="seg2" role="group" aria-label={hit ? "타석" : "던지는 손"}><legend className="sr">{hit ? "타석" : "던지는 손"}</legend>
            <button type="button" aria-pressed={hand === "R"} onClick={() => setHand("R")}>{tx.hand("R")}</button><button type="button" aria-pressed={hand === "L"} onClick={() => setHand("L")}>{tx.hand("L")}</button></fieldset>
          <p className="note">{hit ? "타석(어느 쪽 타자인지)은 앞발이 더 크게 드는 쪽으로 추정했어요." : "던지는 손은 영상에서 자동으로 추정했어요."} 다르면 바꿔 주세요.</p>
          {err && err !== "UNPLAYABLE" && <div className="err-box" role="alert">{err}</div>}
          <div className="metric-tools"><button className="btn small ghost" type="button" onClick={() => { const w = wholeClip(range, MAX_CLIP_S); setM({ start: w.start, end: w.end }); setErr(w.capped ? `브라우저가 감당할 수 있는 ${MAX_CLIP_S}초까지만 잡았어요. 필요한 곳으로 막대를 옮겨 주세요.` : null); const vv = S.current.vid?.video; if (vv) vv.currentTime = w.start; }}>처음부터 끝까지</button></div>
          <p className="hint">지금 {(m.end - m.start).toFixed(1)}초입니다. 끝은 원하는 곳까지 옮겨도 돼요({MIN_CLIP_S}초 이상 {MAX_CLIP_S}초 이하).{m.end - m.start > SOFT_CLIP_S && ` 길수록 분석이 오래 걸리고, ${hit ? "스윙" : "투구"}가 여러 번 섞이면 결과가 흐려질 수 있어요.`}</p>
          <div className="actions"><button className="btn" type="button" onClick={() => setStage("setup")}>이전</button><button className="btn pri grow" type="button" onClick={runFinal}>3D 분석 시작</button></div>
        </div>
      )}
      <p className="note"><Link to="/analyze">분석 방식 다시 고르기</Link></p>
    </div>
  );
}
