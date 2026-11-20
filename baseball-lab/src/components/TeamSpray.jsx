import { useEffect, useState } from "react";
import { Api } from "../lib/api.js";
import { DEF_POS, defense, fieldSvg, pctOf, f1, f3, cn, slash } from "../lib/spray.js";

const Field = ({ e, mode, label }) => <div className="spray-svg sm" dangerouslySetInnerHTML={{ __html: fieldSvg(e, mode, { label }) }} />;

/** 구장별 타구 결과표용: 홈런 비율 지수는 리그 전체를 1.00으로 둔 값 */
export const parkRows = (sp, ids) => {
  const L = sp.meta.league, lgHr = L.hr / L.n;
  return Object.entries(sp.s).filter(([, v]) => v.n >= 500).map(([name, v]) => ({
    name, home: v.home, mine: v.home.some(h => ids.includes(h)), n: v.n,
    hit: pctOf(v.h, v.n), xb: pctOf(v.xb, v.n), hr: pctOf(v.hr, v.n), idx: v.hr / v.n / lgHr,
  })).sort((a, b) => b.idx - a.idx);
};

/** 팀 결과: 타선의 타구 방향, 수비 위치별 안타 허용, 구장별 홈런 (2026 시즌만) */
export default function TeamSpray({ rec }) {
  const [sp, setSp] = useState(null);
  const [mode, setMode] = useState("share");
  useEffect(() => { let live = true; Api.spray().then(d => { if (live) setSp(d); }).catch(() => {}); return () => { live = false; }; }, [rec]);
  if (!sp || rec.season !== sp.meta.season) return null;
  const teams = rec.result.teams.filter(t => sp.t[t.id]);
  if (!teams.length) return null;
  const ids = teams.map(t => t.id), L = sp.meta.league;
  const parks = parkRows(sp, ids);
  const LD = defense(L), TD = Object.fromEntries(teams.map(t => [t.id, defense(sp.t[t.id].fld)]));
  return (
    <section className="sec fc-box spray" aria-label="팀 타구 분석">
      <h2>타구로 본 팀 <small className="tag">2026 시즌</small></h2>
      <p className="sub">투구별 기록에서 타구가 간 수비 위치를 센 결과입니다. 번트와 파울플라이는 뺐고, 좌중간·우중간 타구는 두 외야수에게 절반씩 나눠 셌어요.</p>
      <div className="seg-row" role="group" aria-label="그림 기준">{[["share", "타구가 간 비율"], ["hit", "안타가 된 비율"]].map(([k, l]) => <button key={k} type="button" className={"chip" + (mode === k ? " on" : "")} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}</div>
      <h3>타선이 친 타구</h3>
      <div className="spray-grid">{teams.map(t => <figure key={t.id}><figcaption>{t.name} <small className="muted">타구 {cn(sp.t[t.id].bat.n)}개</small></figcaption><Field e={sp.t[t.id].bat} mode={mode} label={`${t.name} 타선의 타구 방향 그림`} /></figure>)}</div>
      <h3>수비 위치별 안타 허용률</h3>
      <p className="sub">그 팀 수비가 맞은 타구가 안타가 된 비율입니다. 낮을수록 좋고 초록색이 리그 평균보다 잘 막은 곳이에요. 좌중간 타구는 좌익수와 중견수에, 우중간 타구는 중견수와 우익수에 절반씩 나눠 셌습니다. 투수가 맞은 타구의 질도 섞여 있어서 수비력만의 점수는 아닙니다.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>위치</th><th>리그</th>{teams.map(t => <th key={t.id}>{t.name}</th>)}</tr></thead>
        <tbody>{DEF_POS.map((z, i) => (
          <tr key={z}><td>{z}</td><td>{f1(LD[i].rate)}%</td>{teams.map(t => { const v = TD[t.id][i].rate, d = v == null ? null : v - LD[i].rate;
            return <td key={t.id} className={d == null || Math.abs(d) < 1.5 ? undefined : d < 0 ? "good" : "bad"}>{v == null ? "-" : f1(v) + "%"}</td>; })}</tr>))}
          <tr className="lg"><td>전체</td><td>{f1(pctOf(L.h, L.n))}%</td>{teams.map(t => { const f = sp.t[t.id].fld, d = pctOf(f.h, f.n) - pctOf(L.h, L.n); return <td key={t.id} className={Math.abs(d) < 0.8 ? undefined : d < 0 ? "good" : "bad"}>{f1(pctOf(f.h, f.n))}%</td>; })}</tr></tbody></table></div>
      {teams.every(t => sp.t[t.id].plb) && <>
        <h3>좌투·우투를 만났을 때</h3>
        <p className="sub">타선은 좌투·우투 상대 OPS, 투수진은 좌타자·우타자에게 허용한 OPS입니다. 투수진은 낮을수록 좋아요.</p>
        <div className="table-wrap"><table>
          <thead><tr><th>팀</th><th>타선 vs 좌투</th><th>타선 vs 우투</th><th>투수진 vs 좌타자</th><th>투수진 vs 우타자</th></tr></thead>
          <tbody>{teams.map(t => { const x = sp.t[t.id], c = k => slash(x.plb[k]), d = k => slash(x.plf[k]); return (
            <tr key={t.id}><td>{t.name}</td><td>{f3(c("L")?.ops)} <small className="muted">({c("L")?.pa}타석)</small></td><td>{f3(c("R")?.ops)} <small className="muted">({c("R")?.pa}타석)</small></td><td>{f3(d("L")?.ops)}</td><td>{f3(d("R")?.ops)}</td></tr>); })}
            <tr className="lg"><td>리그 평균</td><td>{f3(slash(["L", "R"].map(s => sp.meta.pl[s + "L"]).reduce((a, b) => a.map((v, i) => v + b[i])))?.ops)}</td><td>{f3(slash(["L", "R"].map(s => sp.meta.pl[s + "R"]).reduce((a, b) => a.map((v, i) => v + b[i])))?.ops)}</td><td>{f3(slash(["L", "R"].map(h => sp.meta.pl["L" + h]).reduce((a, b) => a.map((v, i) => v + b[i])))?.ops)}</td><td>{f3(slash(["L", "R"].map(h => sp.meta.pl["R" + h]).reduce((a, b) => a.map((v, i) => v + b[i])))?.ops)}</td></tr></tbody></table></div></>}
      <h3>구장별 타구 결과</h3>
      <p className="sub">구장마다 타구가 어떻게 끝났는지 모았습니다. 홈런 지수는 리그 전체의 홈런 비율을 1.00으로 둔 값이라 높을수록 홈런이 많이 나온 구장이에요. 그 구장을 쓰는 팀의 타선과 투수진 실력이 섞여 있어서 순수한 구장 효과는 아닙니다.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>구장</th><th>홈팀</th><th>타구</th><th>안타 비율</th><th>2루타 이상</th><th>홈런 비율</th><th>홈런 지수</th></tr></thead>
        <tbody>{parks.map(p => <tr key={p.name} className={p.mine ? "mine" : undefined}><td>{p.name}{p.mine ? " (선택한 팀)" : ""}</td><td>{p.home.join(", ")}</td><td>{cn(p.n)}</td><td>{f1(p.hit)}%</td><td>{f1(p.xb)}%</td><td>{f1(p.hr)}%</td><td>{p.idx.toFixed(2)}</td></tr>)}</tbody></table></div>
    </section>
  );
}
