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

export function buildCompare(type, rows, pids, meta, career, fc) {
  const season = rows[0] ? rows[0].season : meta.seasons[0], q = qualFor(meta, season);
  const reps = pids.map(p => build(type, rows, p, q, meta, [], type === "pitcher" ? [] : null));
  const names = reps.map(r => r.subject.name), C = CAREER[type];
  const profile = reps[0].profile.map((p, gi) => ({ name: p.name, scores: reps.map(r => r.profile[gi].score) })).filter(g => g.scores.every(s => s != null));
  const items = reps[0].items.map((it, i) => ({ group: it.group, key: it.key, label: it.label, en: it.en, vals: reps.map(r => ({ display: r.items[i].display, pct: r.items[i].pct })) }));
  items.forEach(it => { it.lead = leader(it.vals.map(v => v.pct)); });
  // 한 문장 요약: 영역에서 앞선 선수와, 지표 개수
  const lead = names.map(() => ({ groups: [], items: 0 }));
  profile.forEach(g => { const l = leader(g.scores); if (l >= 0) lead[l].groups.push(g.name); });
  items.forEach(it => { if (it.lead >= 0) lead[it.lead].items++; });
  const none = items.filter(it => it.lead < 0 && it.vals.some(v => v.pct != null)).length;
  const parts = names.map((n, i) => (lead[i].groups.length ? `${n} 선수는 ${lead[i].groups.join(", ")} 영역에서 앞섭니다.` : `${n} 선수는 뚜렷하게 앞서는 영역이 없습니다.`));
  const summary = `${parts.join(" ")} 지표 ${items.filter(it => it.vals.some(v => v.pct != null)).length}개 중 ${names.map((n, i) => `${n} ${lead[i].items}개`).join(", ")}가 리그 백분위 ${LEAD}점 이상 앞서고(2위와의 차이 기준), ${none}개는 비슷하거나 나뉩니다.`;
  // 나이별 커리어
  const ageSeries = pids.map((p, i) => ({ name: names[i], color: CMP_COLORS[i], width: 2.2, r: 3, pts: ((career && career.players[type][p]) || []).filter(r => r[C.vol] >= C.minShow && r[C.main] != null && r[1] != null).map(r => ({ x: r[1], y: r[C.main], t: `${names[i]} ${r[1]}세(${r[0]}) ${C.stat} ${Number(r[C.main]).toFixed(C.digits)}` })) }));
  const age = ageSeries.every(s => s.pts.length) ? plot({ series: ageSeries, yDigits: C.digits, xFmt: v => `${v}세` }) : null;
  // 앞으로 5년 예측(최신 시즌만)
  const fcs = pids.map(p => (fc && season === fc.meta.base_season ? fc.players[p] : null));
  let fut = null;
  if (fcs.every(Boolean)) {
    const b = fc.meta.base_season;
    fut = plot({ series: fcs.map((f, i) => ({ name: names[i], color: CMP_COLORS[i], width: 2.2, pts: [{ x: b, y: f.now, t: `${names[i]} 올해 ${f.now.toFixed(C.digits)}` }, ...f.pred.map(x => ({ x: x.year, y: x.mid, t: `${names[i]} ${x.year} 예측 ${x.mid.toFixed(C.digits)} (${x.lo.toFixed(C.digits)}~${x.hi.toFixed(C.digits)})` }))] })),
      bands: fcs.map((f, i) => ({ color: BAND[i], pts: [{ x: b, lo: f.now, hi: f.now }, ...f.pred.map(x => ({ x: x.year, lo: x.lo, hi: x.hi }))] })), yDigits: C.digits });
  }
  return { type, season, reps, names, C, profile, items, summary, age, fut, fcs, qualified: reps.map(r => r.qualified) };
}
