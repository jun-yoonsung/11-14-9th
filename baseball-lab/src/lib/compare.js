/* 선수 비교(2~4명) 계산: 화면(pages/Compare.jsx)과 PDF(report.js)가 같이 쓴다 */
import { build } from "./detail.js";
import { CAREER } from "./career.js";
import { plot } from "./chart.js";
import { qualFor } from "./season.js";

export const CMP_COLORS = ["#5e6ad2", "#d0312d", "#17734f", "#c9892b"];
export const LEAD = 8;   // 백분위가 두 번째로 좋은 선수보다 이 값 이상 앞서면 "앞선다"고 본다
const BAND = ["#c9ceef", "#f4c9c6", "#bfe3d2", "#f1dcb4"];

/** 한 줄에서 가장 좋은 값을 가진 선수의 위치(두 번째보다 LEAD 이상 앞설 때만, 아니면 -1) */
function leader(vals) {
  const ok = vals.map((v, i) => [v, i]).filter(x => x[0] != null).sort((a, b) => b[0] - a[0]);
  return ok.length >= 2 && ok[0][0] - ok[1][0] >= LEAD ? ok[0][1] : -1;
}

/** entries: [{ pid, season, rows }] (rows = 그 시즌 전체 선수 기록). 시즌이 달라도 각자 그 시즌 리그 안에서의 백분위로 비교한다.
 *  시즌이 섞이면 모든 선수에게 계산되는 지표만 비교한다(과거 시즌은 공식 시즌 기록 지표만 있음). */
export function buildCompare(type, entries, meta, career, fc) {
  const reps = entries.map(e => build(type, e.rows, e.pid, qualFor(meta, e.season), meta, [], type === "pitcher" ? [] : null));
  const seasons = entries.map(e => e.season), mixed = new Set(seasons).size > 1;
  const dupPid = entries.map((e, i) => entries.findIndex(x => x.pid === e.pid) !== i);   // 같은 선수의 다른 시즌
  const base = reps.map((r, i) => r.subject.name);
  const names = reps.map((r, i) => (mixed || dupPid.some(Boolean) ? `${r.subject.name} ${seasons[i]}` : r.subject.name)), C = CAREER[type];
  const prof = reps.map(r => Object.fromEntries(r.profile.map(g => [g.name, g.score])));
  const profile = reps[0].profile.map(g => ({ name: g.name, scores: reps.map((r, i) => prof[i][g.name]) })).filter(g => g.scores.every(v => v != null));
  const ikey = reps.map(r => Object.fromEntries(r.items.map(it => [it.key, it])));
  const items = reps[0].items.filter(it => ikey.every(m => m[it.key])).map(it => ({ group: it.group, key: it.key, label: it.label, en: it.en, vals: ikey.map(m => ({ display: m[it.key].display, pct: m[it.key].pct })) }));
  items.forEach(it => { it.lead = leader(it.vals.map(v => v.pct)); });
  const lead = names.map(() => ({ groups: [], items: 0 }));
  profile.forEach(g => { const l = leader(g.scores); if (l >= 0) lead[l].groups.push(g.name); });
  items.forEach(it => { if (it.lead >= 0) lead[it.lead].items++; });
  const rated = items.filter(it => it.vals.some(v => v.pct != null)), none = rated.filter(it => it.lead < 0).length;
  const parts = names.map((n, i) => (lead[i].groups.length ? `${n} 선수는 ${lead[i].groups.join(", ")} 영역에서 앞섭니다.` : `${n} 선수는 뚜렷하게 앞서는 영역이 없습니다.`));
  const summary = `${parts.join(" ")} 지표 ${rated.length}개 중 ${names.map((n, i) => `${n} ${lead[i].items}개`).join(", ")}가 리그 백분위 ${LEAD}점 이상 앞서고(2위와의 차이 기준), ${none}개는 비슷하거나 나뉩니다.${mixed ? " 시즌이 서로 달라 각자 그 시즌 리그 안에서의 위치로 비교했고, 모든 선수에게 계산되는 지표만 담았습니다." : ""}`;
  // 나이별 커리어(같은 선수의 다른 시즌은 한 줄만)
  const ageSeries = entries.map((e, i) => (dupPid[i] ? null : { name: base[i], color: CMP_COLORS[i], width: 2.2, r: 3, pts: ((career && career.players[type][e.pid]) || []).filter(r => r[C.vol] >= C.minShow && r[C.main] != null && r[1] != null).map(r => ({ x: r[1], y: r[C.main], t: `${base[i]} ${r[1]}세(${r[0]}) ${C.stat} ${Number(r[C.main]).toFixed(C.digits)}` })) })).filter(Boolean);
  const age = ageSeries.length >= 1 && ageSeries.every(sr => sr.pts.length) && (ageSeries.length > 1) ? plot({ series: ageSeries, yDigits: C.digits, xFmt: v => `${v}세` }) : null;
  // 앞으로 5년 예측: 모두 최신 시즌 기록일 때만
  const fcs = entries.map(e => (e.season === fc.meta.base_season ? fc.players[e.pid] : null));
  let fut = null;
  if (fcs.every(Boolean)) {
    const b = fc.meta.base_season;
    fut = plot({ series: fcs.map((f, i) => ({ name: names[i], color: CMP_COLORS[i], width: 2.2, pts: [{ x: b, y: f.now, t: `${names[i]} 올해 ${f.now.toFixed(C.digits)}` }, ...f.pred.map(x => ({ x: x.year, y: x.mid, t: `${names[i]} ${x.year} 예측 ${x.mid.toFixed(C.digits)} (${x.lo.toFixed(C.digits)}~${x.hi.toFixed(C.digits)})` }))] })),
      bands: fcs.map((f, i) => ({ color: BAND[i], pts: [{ x: b, lo: f.now, hi: f.now }, ...f.pred.map(x => ({ x: x.year, lo: x.lo, hi: x.hi }))] })), yDigits: C.digits });
  }
  return { type, seasons, mixed, reps, names, base, C, profile, items, summary, age, fut, fcs, qualified: reps.map(r => r.qualified) };
}
