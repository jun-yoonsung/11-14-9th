/* 지표 계산: 계산식은 PRD 6장 기준. 분모가 0이면 null(화면에는 "-") */
(function () {
  "use strict";

  const f3 = v => (v == null ? "-" : v < 1 ? v.toFixed(3).replace(/^0/, "") : v.toFixed(3));
  const f2 = v => (v == null ? "-" : v.toFixed(2));
  const f1 = v => (v == null ? "-" : v.toFixed(1));
  const f0 = v => (v == null ? "-" : String(Math.round(v)));
  const fSigned0 = v => (v == null ? "-" : (v > 0 ? "+" : "") + Math.round(v));

  const pc = v => (v == null ? "-" : (v * 100).toFixed(1) + "%");
  const div = (a, b) => (b ? a / b : null);

  // ---------- 타자 ----------
  const obp = s => div(s.h + s.bb + s.hbp, s.ab + s.bb + s.hbp + s.sf);
  const slg = s => div(s.h + s.d2 + 2 * s.d3 + 3 * s.hr, s.ab);
  const BAT = [
    { key: "AVG", label: "타율", en: "AVG", fmt: f3, kind: "rate", better: "high", calc: s => div(s.h, s.ab), how: "안타 ÷ 타수" },
    { key: "OBP", label: "출루율", en: "OBP", fmt: f3, kind: "rate", better: "high", calc: obp, how: "(안타 + 볼넷 + 사구) ÷ (타수 + 볼넷 + 사구 + 희생플라이)" },
    { key: "SLG", label: "장타율", en: "SLG", fmt: f3, kind: "rate", better: "high", calc: slg, how: "루타 ÷ 타수" },
    { key: "OPS", label: "OPS", en: "OPS", fmt: f3, kind: "rate", better: "high", calc: s => { const o = obp(s), l = slg(s); return o == null || l == null ? null : o + l; }, how: "출루율 + 장타율" },
    { key: "CON", label: "컨택 비율", en: "Contact%", fmt: pc, kind: "rate", better: "high", calc: s => div(s.sw - s.wh, s.sw), how: "(스윙 − 헛스윙) ÷ 스윙" },
    { key: "CHS", label: "존 밖 스윙 비율", en: "Chase%", fmt: pc, kind: "rate", better: "low", calc: s => div(s.ozsw, s.oz), how: "존 밖 공에 스윙 ÷ 존 밖 공 (낮을수록 선구안이 좋음)" },
    { key: "HR", label: "홈런", en: "HR", fmt: f0, kind: "count", better: "high", calc: s => s.hr, how: "시즌 홈런 수" },
    { key: "RBI", label: "타점", en: "RBI", fmt: f0, kind: "count", better: "high", calc: s => s.rbi, how: "시즌 타점 수" },
    { key: "R", label: "득점", en: "R", fmt: f0, kind: "count", better: "high", calc: s => s.r, how: "시즌 득점 수" },
    { key: "H", label: "안타", en: "H", fmt: f0, kind: "count", better: "high", calc: s => s.h, how: "시즌 안타 수" },
    { key: "BB", label: "볼넷", en: "BB", fmt: f0, kind: "count", better: "high", calc: s => s.bb, how: "시즌 볼넷 수" },
  ];

  // ---------- 투수 (outs = 잡은 아웃 수, 이닝 = outs ÷ 3) ----------
  const PIT = [
    { key: "ERA", label: "평균자책점", en: "ERA", fmt: f2, kind: "rate", better: "low", calc: s => div(s.er * 27, s.outs), how: "자책점 × 9 ÷ 이닝" },
    { key: "WHIP", label: "WHIP", en: "WHIP", fmt: f2, kind: "rate", better: "low", calc: s => div((s.bb + s.h) * 3, s.outs), how: "(볼넷 + 피안타) ÷ 이닝" },
    { key: "K9", label: "9이닝당 삼진", en: "K/9", fmt: f1, kind: "rate", better: "high", calc: s => div(s.so * 27, s.outs), how: "삼진 × 9 ÷ 이닝" },
    { key: "BB9", label: "9이닝당 볼넷", en: "BB/9", fmt: f1, kind: "rate", better: "low", calc: s => div(s.bb * 27, s.outs), how: "볼넷 × 9 ÷ 이닝" },
    { key: "WHF", label: "헛스윙 유도 비율", en: "Whiff%", fmt: pc, kind: "rate", better: "high", calc: s => div(s.wh, s.sw), how: "헛스윙 ÷ 타자가 스윙한 수" },
    { key: "SO", label: "삼진", en: "SO", fmt: f0, kind: "count", better: "high", calc: s => s.so, how: "시즌 삼진 수" },
    { key: "IP", label: "이닝", en: "IP", fmt: f1, kind: "count", better: "high", calc: s => s.outs / 3, how: "잡은 아웃 수 ÷ 3" },
    { key: "FB", label: "직구 평균 구속", en: "FB km/h", fmt: f1, kind: "count", better: "high", calc: s => (s.fb > 0 ? s.fb : null), how: "직구 투구의 평균 구속(km/h)" },
  ];

  // ---------- 팀 ----------
  const TEAM = [
    { key: "WPCT", label: "승률", en: "WPCT", fmt: f3, kind: "rate", better: "high", calc: s => div(s.w, s.w + s.l), how: "승 ÷ (승 + 패), 무승부 제외" },
    { key: "RS", label: "득점", en: "RS", fmt: f0, kind: "count", better: "high", calc: s => s.rs, how: "시즌 총 득점" },
    { key: "RA", label: "실점", en: "RA", fmt: f0, kind: "count", better: "low", calc: s => s.ra, how: "시즌 총 실점 (낮을수록 좋음)" },
    { key: "RD", label: "득실차", en: "RD", fmt: fSigned0, kind: "count", better: "high", calc: s => s.rs - s.ra, how: "득점 − 실점", diverge: true },
    { key: "W", label: "승", en: "W", fmt: f0, kind: "count", better: "high", calc: s => s.w, how: "시즌 승리 수" },
    { key: "L", label: "패", en: "L", fmt: f0, kind: "count", better: "low", calc: s => s.l, how: "시즌 패배 수 (낮을수록 좋음)" },
  ];

  const TYPES = {
    batter: { label: "타자 분석", short: "타자", noun: "타자", defs: BAT, defaults: ["AVG", "OPS", "HR"], qualify: (s, q) => s.pa >= q.batterPa, qualText: q => `타석 ${q.batterPa} 이상` },
    pitcher: { label: "투수 분석", short: "투수", noun: "투수", defs: PIT, defaults: ["ERA", "WHIP", "K9"], qualify: (s, q) => s.outs >= q.pitcherOuts, qualText: q => `${Math.round(q.pitcherOuts / 3)}이닝 이상` },
    team: { label: "팀 비교", short: "팀", noun: "팀", defs: TEAM, defaults: ["WPCT", "RS", "RA"] },
  };
  const MAX_METRICS = 6;

  const sumLine = list => {
    const out = {};
    list.forEach(r => Object.keys(r).forEach(k => { if (typeof r[k] === "number") out[k] = (out[k] || 0) + r[k]; }));
    return out;
  };
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  // 차이 표시: 부호 + 지표와 같은 자리수
  function fmtDiff(def, d) {
    if (d == null) return "-";
    const abs = Math.abs(d);
    let body;
    if (def.kind === "count" && def.fmt === f0) body = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
    else if (def.fmt === fSigned0) body = String(Math.round(abs));
    else body = def.fmt(abs);
    if (body.endsWith("%")) body += "p";   // 비율 지표의 차이는 %p
    if (abs === 0 || body === "0" || body === ".000" || body === "0.00") return body;
    return (d > 0 ? "+" : "−") + body;
  }
  const fmtLeague = def => v => (v == null ? "-" : def.kind === "count" && def.fmt === f0 ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : def.fmt(v));

  // 리그 평균 대비 좋고 나쁨
  function judge(def, v, lg) {
    if (v == null || lg == null || v === lg) return "even";
    return (def.better === "high" ? v > lg : v < lg) ? "good" : "bad";
  }

  // ---------- 선수 분석 ----------
  function analyzePlayer(type, rows, pid, keys, q) {
    const T = TYPES[type];
    const defs = keys.map(k => T.defs.find(d => d.key === k)).filter(Boolean);
    const qual = rows.filter(r => T.qualify(r, q));
    const line = rows.find(r => r.pid === pid);
    const isQ = T.qualify(line, q);
    const league = sumLine(qual);
    const lines = defs.map(def => {
      const v = def.calc(line);
      const vals = qual.map(def.calc).filter(x => x != null);
      const lg = def.kind === "rate" ? def.calc(league) : mean(vals);
      let pct = null, rank = null;
      if (v != null && vals.length) {
        const worse = vals.filter(x => (def.better === "high" ? x < v : x > v)).length;
        const same = vals.filter(x => x === v).length - (isQ ? 1 : 0);
        pct = Math.round(((worse + 0.5 * Math.max(same, 0) + (isQ ? 0.5 : 0)) / vals.length) * 100);
        pct = Math.min(99, Math.max(1, pct));
        if (isQ) rank = 1 + vals.filter(x => (def.better === "high" ? x > v : x < v)).length;
      }
      const diff = v != null && lg != null ? v - lg : null;
      return {
        key: def.key, label: def.label, en: def.en, better: def.better, how: def.how,
        value: v, display: def.fmt(v), league: lg, leagueDisplay: fmtLeague(def)(lg),
        diffDisplay: fmtDiff(def, diff), tone: judge(def, v, lg), pct, rank, n: vals.length,
      };
    });
    // 쉬운 말 해설: 값이 있는 첫 지표를 기준으로 한다 (조사 문제를 피하려고 "기준으로" 문형을 쓴다)
    let insight = "";
    const base = lines.find(l => l.value != null && l.league != null);
    if (base) {
      const dir = base.value > base.league ? "높고" : base.value < base.league ? "낮고" : "같고";
      const tail = base.better === "low" ? " (낮을수록 좋은 지표입니다)" : "";
      insight = `${base.label} 기준으로 리그 평균(${base.leagueDisplay})보다 ${base.diffDisplay.replace(/^[+−]/, "")} ${dir}, ` +
        (base.rank ? `리그 ${T.noun} ${base.n}명 중 ${base.rank}위입니다.${tail}` : `규정(${T.qualText(q)})을 채우지 못해 순위는 매기지 않았습니다.${tail}`);
    } else {
      insight = "기록이 없어 계산할 수 없는 지표입니다. 다른 선수나 시즌을 골라 보세요.";
    }
    const missing = lines.filter(l => l.value == null).map(l => l.label);
    if (missing.length && base) insight += ` ${missing.join(", ")}은(는) 기록이 없어 "-"로 표시했습니다.`;
    return {
      kind: "player", type,
      subject: { id: line.pid, name: line.name, team: line.team, pos: line.pos, season: line.season },
      qualified: isQ, qualText: T.qualText(q), leagueN: qual.length,
      lines, insight, raw: line,
    };
  }

  // ---------- 팀 비교 ----------
  function analyzeTeams(allRows, ids, keys) {
    const defs = keys.map(k => TEAM.find(d => d.key === k)).filter(Boolean);
    const picked = ids.map(id => allRows.find(r => r.id === id)).filter(Boolean);
    const metrics = defs.map(def => {
      const all = allRows.map(def.calc);
      const lg = mean(all);
      const items = picked.map(t => ({ id: t.id, name: t.name, value: def.calc(t), display: def.fmt(def.calc(t)) }));
      const best = items.reduce((b, it) => (b == null || (def.better === "high" ? it.value > b.value : it.value < b.value) ? it : b), null);
      return { key: def.key, label: def.label, en: def.en, better: def.better, how: def.how, diverge: !!def.diverge,
        league: lg, leagueDisplay: fmtLeague(def)(lg), items, bestId: best ? best.id : null, bestName: best ? best.name : "", bestDisplay: best ? best.display : "" };
    });
    const first = metrics[0];
    const insight = first
      ? `${first.label} 기준 선택한 팀 중 1위: ${first.bestName}(${first.bestDisplay}), 리그 평균 ${first.leagueDisplay}.${first.better === "low" ? " 낮을수록 좋은 지표입니다." : ""}`
      : "";
    return {
      kind: "team", type: "team",
      teams: picked.map(t => ({ id: t.id, name: t.name, season: t.season, raw: t })),
      metrics, insight, leagueN: allRows.length,
    };
  }

  window.Stats = { TYPES, MAX_METRICS, analyzePlayer, analyzeTeams, f0, f3 };
})();
