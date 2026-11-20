import { useEffect, useState } from "react";
import { Api } from "../lib/api.js";
import { ZONES, SIDE_NAMES, PGROUP_NAMES, pctOf, f1, f3, slash, lowSample, fieldSvg } from "../lib/spray.js";

const MODES = [["share", "타구가 간 비율"], ["hit", "안타가 된 비율"]];

const Field = ({ e, mode, label }) => <div className="spray-svg" dangerouslySetInnerHTML={{ __html: fieldSvg(e, mode, { label }) }} />;

const Bar = ({ label, vals, colors = ["#2146c7", "#8d9ab8", "#c9892b"], note }) => (
  <div className="stk"><b>{label}</b>
    <div className="stk-bar">{vals.map((v, i) => v > 0 && <span key={i} style={{ width: v + "%", background: colors[i] }} title={`${SIDE_NAMES[i]} ${f1(v)}%`}>{v >= 9 ? `${SIDE_NAMES[i]} ${v.toFixed(0)}%` : ""}</span>)}</div>
  </div>
);


/** 좌투·우투 상대(타자) / 좌타·우타 상대(투수) */
function Platoon({ e, isBat, meta }) {
  if (!e.pl) return null;
  const main = isBat ? e.main : e.hand;
  const rows = ["L", "R"].map(k => {
    const a = slash(e.pl[k]); const lg = slash(meta.pl[isBat ? main + k : k + main]);
    return { k, a, lg, est: e.pe && e.pe[k], dir: isBat ? e.sdh && e.sdh[k] : e.sds && e.sds[k], hh: e.hh && e.hh[k] };
  });
  if (!rows.some(r => r.a)) return null;
  const mp = meta.platoon;
  const label = k => (isBat ? `${k === "L" ? "좌투" : "우투"} 상대` : `${k === "L" ? "좌타자" : "우타자"} 상대`);
  const diff = (a, b) => (a == null || b == null ? "" : a - b >= 0 ? "good" : "bad");
  return (
    <>
      <h3>{isBat ? "좌투·우투 상대 성적" : `좌타자·우타자 상대 성적 (${main === "L" ? "좌" : "우"}투)`}</h3>
      <p className="sub">{isBat ? `${main === "L" ? "좌" : "우"}타 중심 선수입니다. 투수의 투구 손은 선수 정보와 공을 놓는 위치로 확인했어요.` : "타자가 서는 쪽(좌타·우타)별로 나눈 기록입니다."} 보정 값은 표본이 적어도 흔들리지 않게 고친 타석당 값이에요.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>{isBat ? "상대 투수" : "상대 타자"}</th><th>타석</th><th>타율</th><th>출루율</th><th>장타율</th><th>OPS</th><th>삼진%</th><th>볼넷%</th><th>보정 출루/타석</th><th>보정 루타/타석</th></tr></thead>
        <tbody>{rows.map(r => r.a ? [
          <tr key={r.k}><td>{label(r.k)}</td><td>{r.a.pa}</td><td>{f3(r.a.avg)}</td><td>{f3(r.a.obp)}</td><td>{f3(r.a.slg)}</td><td><b>{f3(r.a.ops)}</b></td><td>{f1(r.a.so)}%</td><td>{f1(r.a.bb)}%</td><td>{r.est ? f3(r.est[0]) : "-"}</td><td>{r.est ? r.est[1].toFixed(3) : "-"}</td></tr>,
          r.lg && <tr key={r.k + "l"} className="lg"><td>리그 평균</td><td>{r.lg.pa}</td><td>{f3(r.lg.avg)}</td><td>{f3(r.lg.obp)}</td><td>{f3(r.lg.slg)}</td><td>{f3(r.lg.ops)}</td><td>{f1(r.lg.so)}%</td><td>{f1(r.lg.bb)}%</td><td colSpan={2}>같은 조합 평균</td></tr>] : null)}</tbody></table></div>
      {rows.every(r => r.dir) && (
        <div className="table-wrap"><table>
          <thead><tr><th>{isBat ? "상대 투수" : "상대 타자"}</th><th>타구</th><th>당겨 침</th><th>가운데</th><th>밀어 침</th><th>안타 비율</th></tr></thead>
          <tbody>{rows.map(r => { const n = r.dir.reduce((a, b) => a + b, 0); return <tr key={r.k}><td>{label(r.k)}</td><td>{n}</td>{r.dir.map((v, i) => <td key={i}>{n ? f1(pctOf(v, n)) + "%" : "-"}</td>)}<td>{r.hh && r.hh[0] ? f1(pctOf(r.hh[1], r.hh[0])) + "%" : "-"}</td></tr>; })}</tbody></table></div>)}
      <p className="legend">{isBat ? "같은 쪽에 서는 타자가 같은 손 투수를 만나면 보통 더 어려워서 리그 평균도 갈립니다." : "투수도 마찬가지로 같은 쪽 타자를 상대할 때 유리한 경우가 많습니다."} 개인의 좌우 차이는 한 시즌 표본에서는 우연이 커서, 보정 값은 리그 평균 차이를 바탕으로 이 선수의 차이를 아주 조금만 반영했습니다(비교 결과는 아래 "이 분석은 어떻게 만들었나").</p>
    </>
  );
}

/** 타구 방향·타구 유형 (2026 시즌만). 투구별 기록 문장에서 뽑은 수비 위치 기준이라 정확한 좌표는 아니다. */
export default function Spray({ rec }) {
  const [data, setData] = useState(null);
  const [mode, setMode] = useState("share");
  useEffect(() => { let live = true; Api.spray().then(d => { if (live) setData(d); }).catch(() => {}); return () => { live = false; }; }, [rec]);
  if (!data || rec.season !== data.meta.season) return null;
  const isBat = rec.type === "batter";
  const e = (isBat ? data.b : data.p)[String(rec.params.target)];
  if (!e || e.n < 1) return null;
  const m = data.meta, L = m.league;
  const outs = e.ty[0] + e.ty[1] + e.ty[2], lgOuts = L.ty[0] + L.ty[1] + L.ty[2];
  const goao = e.ty[1] + e.ty[2] ? e.ty[0] / (e.ty[1] + e.ty[2]) : null, lgGoao = L.ty[0] / (L.ty[1] + L.ty[2]);
  const few = lowSample(e.n);
  const sdPct = e.sd.map(v => pctOf(v, e.n));
  const lgSide = isBat ? [0, 1, 2].map(i => (e.st.L || 0) * m.league_side.L[i] + (e.st.R || 0) * m.league_side.R[i]).map(v => v / ((e.st.L || 0) + (e.st.R || 0)) * 100) : null;
  const best = [...Array(11).keys()].sort((a, b) => e.z[b] - e.z[a])[0];
  return (
    <section className="sec fc-box spray" aria-label="타구 방향">
      <h2>{isBat ? "타구 방향" : "맞은 타구 방향"} <small className="tag">2026 시즌</small></h2>
      <p className="sub">{isBat ? "이 선수의 타구가 어느 수비 위치로 갔는지" : "이 투수가 맞은 타구가 어느 수비 위치로 갔는지"} 센 결과예요. 번트와 파울플라이는 뺀 {e.n}개 타구를 썼습니다. 가장 많이 간 곳은 <b>{ZONES[best]}</b>({f1(pctOf(e.z[best], e.n))}%)입니다.</p>
      {few && <p className="note">타구가 {e.n}개뿐이라 한쪽으로 치우쳐 보일 수 있어요. 경향을 읽을 때는 참고만 하세요.</p>}
      <div className="seg-row" role="group" aria-label="그림 기준">{MODES.map(([k, l]) => <button key={k} type="button" className={"chip" + (mode === k ? " on" : "")} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}</div>
      <Field e={e} mode={mode} label={isBat ? "타구 방향 그림" : "맞은 타구 방향 그림"} />
      <p className="legend">진할수록 {mode === "share" ? "타구가 많이 간 곳" : "타구가 안타(홈런 포함)가 된 비율이 높은 곳"}입니다. 정확한 낙하 지점이 아니라 기록에 적힌 수비 위치 기준이에요.</p>

      {isBat && (
        <>
          <h3>당겨 치는 타자일까?</h3>
          <p className="sub">우타자는 좌익수·좌중간·3루수 쪽, 좌타자는 우익수·우중간·1루수 쪽이 당겨 친 타구입니다. 유격수·2루수·투수·포수·중견수는 가운데로 셉니다.</p>
          <Bar label="이 선수" vals={sdPct} />
          <Bar label="리그 평균" vals={lgSide} />
          {!few && <p className="legend">표본 보정 값: 당겨 침 {f1(e.sm[0] * 100)}%, 가운데 {f1(e.sm[1] * 100)}%, 밀어 침 {f1(e.sm[2] * 100)}%</p>}
          <p className="legend">{e.main === "L" ? "좌타" : "우타"} 중심 선수. {e.st.L && e.st.R ? `좌타 ${e.st.L}개, 우타 ${e.st.R}개 타구를 합쳤습니다. ` : ""}
            보정 값은 표본이 적은 선수를 리그 평균 쪽으로 당긴 값(k={m.k})이라, 개수가 적을수록 평균에 가깝게 나옵니다.</p>

          <h3>공 코스에 따라 방향이 달라질까?</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>공이 온 곳</th><th>실제 타구 수</th><th>실제 당겨 친 비율</th><th>예상 당겨 침(우투 상대)</th><th>예상 당겨 침(좌투 상대)</th><th>예상 밀어 침(우투)</th><th>예상 밀어 침(좌투)</th></tr></thead>
            <tbody>{["바깥쪽", "가운데", "안쪽"].map((nm, c) => { const n = e.cr[c].reduce((a, b) => a + b, 0); return (
              <tr key={nm}><td>{nm}</td><td>{n}</td><td>{n ? f1(pctOf(e.cr[c][0], n)) + "%" : "-"}</td><td><b>{f1(e.md[c][0][0] * 100)}%</b></td><td><b>{f1(e.md[c][1][0] * 100)}%</b></td><td>{f1(e.md[c][0][2] * 100)}%</td><td>{f1(e.md[c][1][2] * 100)}%</td></tr>); })}</tbody></table></div>
          <p className="legend">리그 전체로 보면 안쪽 공은 {f1(m.course_pull["안쪽"] * 100)}%가 당겨 쳐지고 바깥쪽 공은 {f1(m.course_pull["바깥쪽"] * 100)}%만 당겨 쳐집니다. "모델이 예상한 당겨 침"은 {m.model_pick} 모델이 이 선수의 평소 경향과 직구·1볼 1스트라이크 기준 공 코스를 넣어 계산한 값입니다.</p>
        </>
      )}

      <h3>{isBat ? "어떤 공을 어디로 쳤을까?" : "어떤 공이 어디로 맞았을까?"}</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>공 종류</th><th>타구</th><th>당겨 침</th><th>가운데</th><th>밀어 침</th><th>안타 비율</th><th>리그 안타 비율</th></tr></thead>
        <tbody>{e.pg.map((g, i) => (
          <tr key={i}><td className="l">{PGROUP_NAMES[i]}</td><td>{g[0]}</td><td>{g[0] ? f1(pctOf(g[1], g[0])) + "%" : "-"}</td><td>{g[0] ? f1(pctOf(g[2], g[0])) + "%" : "-"}</td><td>{g[0] ? f1(pctOf(g[3], g[0])) + "%" : "-"}</td>
            <td>{g[0] ? f1(pctOf(g[4], g[0])) + "%" : "-"}</td><td>{f1(pctOf(L.pg[i][4], L.pg[i][0]))}%</td></tr>))}</tbody></table></div>
      <p className="legend">{isBat ? "마지막 공" : "타구가 된 공"}의 종류 기준입니다. 당겨 침 기준은 위와 같고, 타구 수가 적은 칸은 우연의 영향이 큽니다.</p>

      <Platoon e={e} isBat={isBat} meta={m} />

      <h3>{isBat ? "땅볼·뜬공 성향" : "땅볼·뜬공을 얼마나 만들까?"}</h3>
      <div className="kpis kpis-sm">
        <div className="kpi"><small>땅볼 아웃 : 뜬공 아웃</small><strong>{goao == null ? "-" : goao.toFixed(2)}</strong><em>리그 평균 {lgGoao.toFixed(2)}</em></div>
        <div className="kpi"><small>땅볼 아웃</small><strong>{e.ty[0]}</strong><em>아웃 타구의 {f1(pctOf(e.ty[0], outs))}% (리그 {f1(pctOf(L.ty[0], lgOuts))}%)</em></div>
        <div className="kpi"><small>뜬공 아웃</small><strong>{e.ty[1]}</strong><em>{f1(pctOf(e.ty[1], outs))}% (리그 {f1(pctOf(L.ty[1], lgOuts))}%)</em></div>
        <div className="kpi"><small>{isBat ? "병살타" : "병살 유도"}</small><strong>{e.dp}</strong><em>땅볼 아웃의 {f1(pctOf(e.dp, e.ty[0]))}% (리그 {f1(pctOf(L.dp, L.ty[0]))}%)</em></div>
        <div className="kpi"><small>라인드라이브 아웃</small><strong>{e.ty[2]}</strong><em>{f1(pctOf(e.ty[2], outs))}% (리그 {f1(pctOf(L.ty[2], lgOuts))}%)</em></div>
      </div>
      <p className="legend">안타는 땅볼인지 뜬공인지 기록에 적혀 있지 않아서, 아웃이 된 타구만으로 비율을 셌습니다. 그래서 라인드라이브 비율은 실제보다 작게 나옵니다.</p>

      <h3>방향별 결과</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>위치</th><th>타구</th><th>비율</th><th>리그 비율</th><th>안타</th><th>안타 비율</th><th>2루타 이상</th></tr></thead>
        <tbody>{ZONES.map((z, i) => e.z[i] > 0 || L.z[i] > 0 ? (
          <tr key={z}><td>{z}</td><td>{e.z[i]}</td><td>{f1(pctOf(e.z[i], e.n))}%</td><td>{f1(pctOf(L.z[i], L.n))}%</td><td>{e.zh[i]}</td><td>{e.z[i] ? f1(pctOf(e.zh[i], e.z[i])) + "%" : "-"}</td><td>{e.zx[i]}</td></tr>) : null)}</tbody></table></div>
      <details className="gloss"><summary>이 분석은 어떻게 만들었나</summary>
        <p className="sub">경기 기록의 타석 결과 문장(예: "우익수 오른쪽 2루타")에서 타구가 간 수비 위치를 뽑았고, 2026 시즌 정규시즌 타구 {m.n.toLocaleString()}개를 모았습니다. 타구 속도·발사각·좌표는 없습니다.
          다음 타구의 방향(당김·가운데·밀기)을 맞히는 모델 여러 개를 시즌 앞부분으로 학습하고 9월 이후 타구로 시험해 비교했습니다. 손실이 작을수록 좋습니다(로그손실).</p>
        <div className="table-wrap"><table><thead><tr><th>모델</th><th>검증(8월)</th><th>시험(9월 이후)</th></tr></thead>
          <tbody>{Object.entries(m.models).map(([k, v]) => <tr key={k}><td className="l">{k}</td><td>{v.val.toFixed(4)}</td><td>{v.test == null ? "-" : v.test.toFixed(4)}</td></tr>)}</tbody></table></div>
        {m.platoon && <>
          <p className="sub">좌우 상대 성적은 아래 후보들을 같은 방식으로 비교했습니다(출루 여부는 로그손실, 타석당 루타는 평균제곱오차, 모두 낮을수록 좋음).</p>
          <div className="table-wrap"><table><thead><tr><th>후보</th><th>출루 검증</th><th>출루 시험</th><th>루타 검증</th><th>루타 시험</th></tr></thead>
            <tbody>{Object.keys(m.platoon.results["출루"]).map(k => { const a = m.platoon.results["출루"][k], b = m.platoon.results["루타"][k]; return <tr key={k}><td className="l">{k}</td><td>{a.val.toFixed(4)}</td><td>{a.test.toFixed(4)}</td><td>{b.val.toFixed(4)}</td><td>{b.test.toFixed(4)}</td></tr>; })}</tbody></table></div>
          <p className="sub">상대 투수 실력까지 반영한 보정 모델이 가장 좋았고, 기계학습 모델은 이 문제에서는 오히려 못했습니다(입력이 적고 타석 결과의 우연이 커서 과적합). 선수별 좌우 차이를 거의 반영하지 않는 쪽이 정확했다는 것은 한 시즌 표본으로는 개인의 좌우 성향이 대부분 우연이라는 뜻이에요.</p></>}
        <p className="sub">선수 개인 기록만 쓴 모델은 리그 평균보다 조금만 나아졌습니다(한 시즌 표본에서 타자의 방향 성향은 약하게만 드러나요). 공이 들어온 코스·구종·구속·볼카운트를 함께 넣은 기계학습 모델은 훨씬 잘 맞혔고, CatBoost와 LightGBM은 거의 같은 수준이라 둘의 평균을 코스별 예상에 사용했습니다. 학습할 때 선수 비율에 정답이 섞여 들어가지 않게 5조각으로 나눠 계산했어요.</p></details>
    </section>
  );
}
