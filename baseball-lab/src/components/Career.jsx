import { useEffect, useState } from "react";
import { Api } from "../lib/api.js";
import { CAREER, careerPlot, careerSummary } from "../lib/career.js";

const f = (v, n) => (v == null ? "-" : Number(v).toFixed(n));

/** 커리어 그래프: 지난 시즌 기록과 리그 평균, 앞으로 5년 예측을 한 그림으로 보여 준다. */
export default function Career({ rec }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.all([Api.career(), Api.forecast()]).then(([career, fc]) => { if (live) setData({ career, fc }); }).catch(() => {});
    return () => { live = false; };
  }, [rec]);
  const rows = data?.career?.players?.[rec.type]?.[String(rec.params.target)];
  if (!rows || rows.length < 2) return null;
  const C = CAREER[rec.type], isBat = rec.type === "batter";
  const p = data.fc?.players?.[String(rec.params.target)];
  const cp = careerPlot(rec.type, rows, data.career.league[rec.type], p, data.fc);
  const s = careerSummary(rec.type, rows);
  if (!cp || !cp.geom) return null;
  const g = cp.geom;
  return (
    <section className="sec fc-box" aria-label="커리어">
      <h2>{cp.useFc ? "커리어와 앞으로" : "커리어"} <small className="tag">1982~2026 기록</small></h2>
      <p className="sub">데뷔 이후 시즌별 {C.stat}입니다. 점 위에 마우스를 올리면 시즌 기록이 보여요. {isBat ? "50타석" : "20이닝"} 미만인 시즌은 그래프에서 뺐고, 아래 표에는 모두 있습니다.</p>
      <ul className="legend2">
        <li><i style={{ background: "#101216" }} />선수 {C.stat}</li><li><i className="dash" style={{ borderColor: "#8e96a6" }} />리그 평균({isBat ? "100타석" : "30이닝"} 이상 선수 평균)</li>
        {cp.useFc && <><li><i className="dash" style={{ borderColor: "#5e6ad2" }} />앞으로 예측</li><li><i style={{ background: "#e3e6f8", border: "1px solid #c9ceef" }} />80% 범위</li></>}
      </ul>
      <figure className="fc-chart">
        <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`${rec.result.subject.name} 시즌별 ${C.stat} 그래프`}>
          {g.yt.map(t => <g key={t.y}><line x1={g.L} x2={g.W - g.R} y1={t.y} y2={t.y} className="fc-grid" /><text x={g.L - 6} y={t.y + 4} textAnchor="end" className="fc-tick">{t.label}</text></g>)}
          {g.bandPaths.map((b, i) => <path key={i} d={b.d} className="fc-band" />)}
          {g.paths.map(pt => <path key={pt.name} d={pt.d} fill="none" stroke={pt.color} strokeWidth={pt.width} strokeDasharray={pt.dash} strokeLinejoin="round" />)}
          {g.dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.hollow ? "#fff" : d.color} stroke={d.color} strokeWidth="1.6"><title>{d.title}</title></circle>)}
          {g.xt.map(t => <text key={t.label} x={t.x} y={g.H - 10} textAnchor="middle" className="fc-tick">{t.label}</text>)}
        </svg>
        <figcaption>{C.better === "low" ? "ERA는 낮을수록 좋은 기록이라 그래프가 아래로 갈수록 좋아집니다." : "OPS는 높을수록 좋은 기록입니다."}</figcaption>
      </figure>
      <ul className="plain">
        <li>{s.first}~{s.last} 시즌 {s.seasons}시즌을 뛰었습니다.{isBat ? ` 통산 홈런 ${s.hr}개, 통산 ${s.tot}타석.` : ` 통산 ${s.w}승 ${s.l}패 ${s.sv}세이브, ${f(s.tot, 1)}이닝.`}</li>
        {s.peak && <li>가장 좋았던 시즌은 {s.peak[0]}년({s.peak[1]}세)으로 {C.stat} {f(s.peak[C.main], C.digits)}입니다 ({isBat ? "200타석" : "50이닝"} 이상 시즌 중).</li>}
        {s.avgMain != null && <li>통산 {C.stat}은 {f(s.avgMain, C.digits)}입니다 ({isBat ? "시즌 OPS를 타석으로 가중 평균한 약식 값" : "이닝으로 가중 평균한 값"}).</li>}
      </ul>
      <details className="fc-acc"><summary>시즌별 기록 표 보기</summary>
        <div className="table-wrap"><table>
          <thead><tr>{(isBat ? ["시즌", "나이", "팀", "경기", "타석", "타율", "출루율", "장타율", "OPS", "홈런"] : ["시즌", "나이", "팀", "경기", "이닝", "ERA", "WHIP", "K/9", "승", "패", "세이브"]).map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.slice().reverse().map(r => (
            <tr key={r[0]} className={r[0] === data.career.meta.base_season ? "me" : undefined}>{r.map((v, i) => <td key={i}>{isBat ? (i >= 5 && i <= 8 ? f(v, 3) : v ?? "-") : (i === 4 ? f(v, 1) : i === 5 || i === 6 ? f(v, 2) : i === 7 ? f(v, 1) : v ?? "-")}</td>)}</tr>
          ))}</tbody></table></div>
      </details>
      <p className="note">출처: Kaggle <i>KBO Player Stats 1982–2026</i> (netsong, KBO 공식 기록 기반, CC BY-NC-SA 4.0). 시즌 중 팀을 옮긴 선수는 시즌 기록을 합쳐 계산했습니다.</p>
    </section>
  );
}
