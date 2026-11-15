/* 상세 분석 보고서: 선수 유형(타자·투수)마다 필요한 항목을 모아 정리한다.
   분석이 끝나면 build()로 만들어 분석 기록에 함께 저장하고, 결과 화면은 저장된 보고서를 render()로 그린다. */
(function () {
  "use strict";
  const esc = BL.esc;

  const div = (a, b) => (b ? a / b : null);
  const f0 = v => (v == null ? "-" : String(Math.round(v)));
  const f1 = v => (v == null ? "-" : v.toFixed(1));
  const f2 = v => (v == null ? "-" : v.toFixed(2));
  const f3 = v => (v == null ? "-" : v < 1 ? v.toFixed(3).replace(/^0/, "") : v.toFixed(3));
  const pc = v => (v == null ? "-" : (v * 100).toFixed(1) + "%");
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  // ---------- 지표 정의 ----------
  const pa = s => s.ab + s.bb + s.hbp + s.sf;
  const obp = s => div(s.h + s.bb + s.hbp, pa(s));
  const slg = s => div(s.h + s.d2 + 2 * s.d3 + 3 * s.hr, s.ab);
  const avg = s => div(s.h, s.ab);
  const D = (key, label, en, group, better, kind, fmt, calc, how, desc) => ({ key, label, en, group, better, kind, fmt, calc, how, desc });

  const BAT = [
    D("AVG", "타율", "AVG", "정확성", "high", "rate", f3, avg, "안타 ÷ 타수", "공을 맞혀 안타로 만든 비율입니다. 높을수록 잘 칩니다."),
    D("K", "삼진 비율", "K%", "정확성", "low", "rate", pc, s => div(s.so, pa(s)), "삼진 ÷ 타석", "타석에서 삼진으로 물러난 비율입니다. 낮을수록 공을 잘 맞힙니다."),
    D("CON", "컨택 비율", "Contact%", "정확성", "high", "rate", pc, s => div(s.sw - s.wh, s.sw), "(스윙 − 헛스윙) ÷ 스윙", "배트를 휘두른 공 중 맞힌(파울 포함) 비율입니다. 높을수록 헛스윙이 적습니다."),
    D("CHS", "존 밖 스윙 비율", "Chase%", "선구안", "low", "rate", pc, s => div(s.ozsw, s.oz), "존 밖 공에 스윙 ÷ 존 밖 공", "스트라이크존 밖 공에 배트가 나간 비율입니다. 낮을수록 공을 잘 참습니다."),
    D("BBP", "볼넷 비율", "BB%", "선구안", "high", "rate", pc, s => div(s.bb, pa(s)), "볼넷 ÷ 타석", "타석에서 볼넷을 얻은 비율입니다. 높을수록 공을 잘 고릅니다."),
    D("BBK", "볼넷 대비 삼진", "BB/K", "선구안", "high", "rate", f2, s => div(s.bb, s.so), "볼넷 ÷ 삼진", "삼진 한 번에 볼넷을 몇 번 얻었는지입니다. 1에 가까우면 선구안이 좋습니다."),
    D("SLG", "장타율", "SLG", "장타력", "high", "rate", f3, slg, "루타 ÷ 타수", "안타 하나가 평균 몇 루타인지입니다. 장타가 많을수록 높습니다."),
    D("ISO", "순장타율", "ISO", "장타력", "high", "rate", f3, s => { const l = slg(s), a = avg(s); return l == null || a == null ? null : l - a; }, "장타율 − 타율", "단타를 빼고 순수한 장타 능력만 본 값입니다."),
    D("HRR", "홈런 비율", "HR/AB", "장타력", "high", "rate", pc, s => div(s.hr, s.ab), "홈런 ÷ 타수", "타수 중 홈런이 된 비율입니다."),
    D("OBP", "출루율", "OBP", "출루·종합", "high", "rate", f3, obp, "(안타 + 볼넷 + 사구) ÷ (타수 + 볼넷 + 사구 + 희생플라이)", "타석에서 베이스에 나간 비율입니다."),
    D("OPS", "OPS", "OPS", "출루·종합", "high", "rate", f3, s => { const o = obp(s), l = slg(s); return o == null || l == null ? null : o + l; }, "출루율 + 장타율", "출루와 장타를 합친 대표 종합 지표입니다. .800 이상이면 좋은 타자로 봅니다."),
    D("RBI", "타점", "RBI", "득점 생산", "high", "count", f0, s => s.rbi, "시즌 타점 수", "주자를 홈으로 불러들인 횟수입니다."),
    D("R", "득점", "R", "득점 생산", "high", "count", f0, s => s.r, "시즌 득점 수", "직접 홈을 밟아 올린 점수입니다."),
  ];

  const ip = s => s.outs / 3;
  const PIT = [
    D("ERA", "평균자책점", "ERA", "실점 억제", "low", "rate", f2, s => div(s.er * 27, s.outs), "자책점 × 9 ÷ 이닝", "9이닝을 던졌을 때 내주는 자책점입니다. 낮을수록 좋습니다."),
    D("WHIP", "WHIP", "WHIP", "실점 억제", "low", "rate", f2, s => div((s.bb + s.h) * 3, s.outs), "(볼넷 + 피안타) ÷ 이닝", "이닝당 내보낸 주자 수입니다. 낮을수록 좋습니다."),
    D("FIP", "수비 무관 평균자책(약식)", "FIP", "실점 억제", "low", "rate", f2, s => (s.outs ? (13 * s.hr + 3 * s.bb - 2 * s.so) / ip(s) + 3.1 : null), "(13×피홈런 + 3×볼넷 − 2×삼진) ÷ 이닝 + 3.10", "수비 도움과 운을 빼고 투수 본인의 결과만으로 본 평균자책입니다. 약식 상수 3.10을 썼습니다."),
    D("K9", "9이닝당 삼진", "K/9", "탈삼진", "high", "rate", f1, s => div(s.so * 27, s.outs), "삼진 × 9 ÷ 이닝", "9이닝 동안 잡는 삼진 수입니다."),
    D("SO", "삼진", "SO", "탈삼진", "high", "count", f0, s => s.so, "시즌 삼진 수", "시즌 전체 삼진 수입니다."),
    D("FB", "직구 평균 구속", "FB km/h", "구위", "high", "count", f1, s => (s.fb > 0 ? s.fb : null), "직구 투구의 평균 구속(km/h)", "직구의 평균 속도입니다. 빠를수록 구위가 좋은 편입니다."),
    D("BB9", "9이닝당 볼넷", "BB/9", "제구", "low", "rate", f1, s => div(s.bb * 27, s.outs), "볼넷 × 9 ÷ 이닝", "9이닝 동안 내주는 볼넷 수입니다. 낮을수록 제구가 좋습니다."),
    D("KBB", "볼넷 대비 삼진", "K/BB", "제구", "high", "rate", f2, s => div(s.so, s.bb), "삼진 ÷ 볼넷", "볼넷 하나에 삼진을 몇 개 잡는지입니다. 높을수록 좋습니다."),
    D("H9", "9이닝당 피안타", "H/9", "피안타 억제", "low", "rate", f1, s => div(s.h * 27, s.outs), "피안타 × 9 ÷ 이닝", "9이닝 동안 맞는 안타 수입니다."),
    D("HR9", "9이닝당 피홈런", "HR/9", "피안타 억제", "low", "rate", f2, s => div(s.hr * 27, s.outs), "피홈런 × 9 ÷ 이닝", "9이닝 동안 맞는 홈런 수입니다."),
    D("IP", "이닝", "IP", "이닝 소화", "high", "count", f1, ip, "잡은 아웃 수 ÷ 3", "시즌 동안 던진 이닝입니다."),
    D("IPG", "경기당 이닝", "IP/G", "이닝 소화", "high", "rate", f1, s => div(ip(s), s.g), "이닝 ÷ 경기", "한 경기에 평균 몇 이닝을 책임지는지입니다. 선발은 길고 구원은 짧습니다."),
    D("WHF", "헛스윙 유도 비율", "Whiff%", "탈삼진", "high", "rate", pc, s => div(s.wh, s.sw), "헛스윙 ÷ 타자가 스윙한 수", "타자가 휘두른 공 중 헛스윙이 나온 비율입니다. 높을수록 타자를 속입니다."),
    D("CHS", "존 밖 스윙 유도", "Chase%", "탈삼진", "high", "rate", pc, s => div(s.ozsw, s.oz), "존 밖 공에 스윙 ÷ 존 밖 공", "존 밖으로 던진 공에 타자가 배트를 낸 비율입니다. 높을수록 유인구가 잘 통합니다.")
  ];

  const CFG = {
    batter: {
      defs: BAT, noun: "타자", qualify: (s, q) => s.pa >= q.batterPa, qualText: q => `타석 ${q.batterPa} 이상`,
      groups: {
        "정확성": { desc: "공을 얼마나 정확하게 맞히는지", type: "정확하게 맞히는 교타형" },
        "선구안": { desc: "볼과 스트라이크를 얼마나 잘 가리는지", type: "공을 잘 고르는 선구안형" },
        "장타력": { desc: "장타를 얼마나 만들어 내는지", type: "장타로 승부하는 거포형" },
        "출루·종합": { desc: "출루와 생산을 합친 종합 능력", type: "출루와 생산을 겸비한 종합형" },
        "득점 생산": { desc: "타점과 득점으로 점수에 기여하는 정도", type: "타점과 득점으로 기여하는 해결사형" },
      },
      similarKeys: ["AVG", "K", "BBP", "SLG", "ISO", "OBP", "OPS"],
    },
    pitcher: {
      defs: PIT, noun: "투수", qualify: (s, q) => s.outs >= q.pitcherOuts, qualText: q => `${Math.round(q.pitcherOuts / 3)}이닝 이상`,
      groups: {
        "실점 억제": { desc: "점수를 얼마나 덜 주는지", type: "실점을 잘 막는 안정형" },
        "탈삼진": { desc: "타자를 삼진으로 얼마나 잡는지", type: "삼진으로 잡는 구위형" },
        "구위": { desc: "직구가 얼마나 빠른지", type: "빠른 공으로 압도하는 강속구형" },
        "제구": { desc: "볼넷 없이 스트라이크를 던지는지", type: "볼넷이 적은 제구형" },
        "피안타 억제": { desc: "안타와 홈런을 얼마나 덜 맞는지", type: "장타를 잘 막는 억제형" },
        "이닝 소화": { desc: "한 경기에 얼마나 오래 던지는지", type: "이닝을 길게 책임지는 이닝이터형" },
      },
      similarKeys: ["ERA", "WHIP", "K9", "BB9", "HR9", "IPG"],
    },
  };

  const sumLine = list => {
    const out = {};
    list.forEach(r => Object.keys(r).forEach(k => { if (typeof r[k] === "number") out[k] = (out[k] || 0) + r[k]; }));
    return out;
  };
  const judge = (def, v, lg) => (v == null || lg == null || v === lg ? "even" : (def.better === "high" ? v > lg : v < lg) ? "good" : "bad");
  const fmtV = (def, v) => (v == null ? "-" : def.kind === "count" && def.fmt === f0 ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : def.fmt(v));
  const fmtDiff = (def, d) => {
    if (d == null) return "-";
    const a = Math.abs(d), body = def.kind === "count" && def.fmt === f0 ? (Number.isInteger(a) ? String(a) : a.toFixed(1)) : def.fmt(a);
    const b2 = body.endsWith("%") ? body + "p" : body;   // 비율 지표의 차이는 %p로 표시
    return !/[1-9]/.test(body) ? b2 : (d > 0 ? "+" : "−") + b2;
  };
  const pctOf = (def, v, vals, selfIn) => {
    if (v == null || !vals.length) return null;
    const worse = vals.filter(x => (def.better === "high" ? x < v : x > v)).length;
    const same = vals.filter(x => x === v).length - (selfIn ? 1 : 0);
    const p = Math.round(((worse + 0.5 * Math.max(same, 0) + (selfIn ? 0.5 : 0)) / vals.length) * 100);
    return Math.min(99, Math.max(1, p));
  };

  // 한 선수의 모든 지표를 리그와 비교해 계산한다
  function measure(C, rows, line, q) {
    const qual = rows.filter(r => C.qualify(r, q));
    const isQ = C.qualify(line, q);
    const league = sumLine(qual);
    return C.defs.map(def => {
      const v = def.calc(line);
      const vals = qual.map(def.calc).filter(x => x != null);
      const lg = def.kind === "rate" ? def.calc(league) : mean(vals);
      const pct = pctOf(def, v, vals, isQ);
      const rank = v != null && isQ ? 1 + vals.filter(x => (def.better === "high" ? x > v : x < v)).length : null;
      return {
        key: def.key, label: def.label, en: def.en, group: def.group, better: def.better, how: def.how, desc: def.desc,
        value: v, display: fmtV(def, v), league: lg, leagueDisplay: fmtV(def, lg),
        diffDisplay: fmtDiff(def, v != null && lg != null ? v - lg : null), tone: judge(def, v, lg), pct, rank, n: vals.length,
      };
    });
  }

  const top = p => (p == null ? "-" : `상위 ${100 - p}%`);

  // ---------- 보고서 만들기 ----------
  function build(type, rows, pid, q, meta, monthly, mix) {
    const C = CFG[type];
    const line = rows.find(r => r.pid === pid);
    const isQ = C.qualify(line, q);
    const items = measure(C, rows, line, q);
    const by = Object.fromEntries(items.map(i => [i.key, i]));
    const teamName = id => ((meta.teams || []).find(t => t.id === id) || {}).name || id;

    // 능력 프로필: 영역별 백분위 평균
    const profile = Object.keys(C.groups).map(g => {
      const its = items.filter(i => i.group === g);
      const ps = its.map(i => i.pct).filter(p => p != null);
      return { name: g, desc: C.groups[g].desc, type: C.groups[g].type, score: ps.length ? Math.round(mean(ps)) : null, keys: its.map(i => i.key) };
    });
    const scored = profile.filter(p => p.score != null).sort((a, b) => b.score - a.score);

    // 강점과 보완점: 백분위 기준 (같은 영역에서 겹치지 않게 영역당 1개씩)
    const ranked = items.filter(i => i.pct != null).sort((a, b) => b.pct - a.pct);
    const pickOne = list => { const seen = new Set(), out = []; for (const i of list) { if (!seen.has(i.group)) { seen.add(i.group); out.push(i); } if (out.length === 3) break; } return out; };
    const strengths = pickOne(ranked), weaknesses = pickOne(ranked.slice().reverse());

    // 한 줄 진단
    let headline = "";
    if (scored.length) {
      const best = ranked[0], worst = ranked[ranked.length - 1];
      headline = `${line.season} 시즌 ${line.name} 선수는 <b>${C.groups[scored[0].name].type}</b>입니다. ` +
        `가장 두드러진 지표는 ${best.label}(리그 ${top(best.pct)})이고, 보완이 필요한 지표는 ${worst.label}(리그 ${top(worst.pct)})입니다.`;
    }

    // 구성: 타자는 안타 구성, 투수는 9이닝 결과
    let composition;
    const qual = rows.filter(r => C.qualify(r, q)), L = sumLine(qual);
    if (type === "batter") {
      const parts = s => [["단타", s.h - s.d2 - s.d3 - s.hr], ["2루타", s.d2], ["3루타", s.d3], ["홈런", s.hr]];
      const share = s => { const t = s.h || 0; return parts(s).map(([label, n]) => ({ label, n, pct: t ? (n / t) * 100 : 0 })); };
      composition = { kind: "stack", title: "안타 구성", note: "안타가 어떤 종류로 이루어졌는지 비교합니다. 장타(2루타 이상) 비중이 높을수록 장타 위주 타자입니다.", player: share(line), league: share(L) };
    } else {
      const per9 = s => [["삼진", s.so], ["볼넷", s.bb], ["피안타", s.h], ["피홈런", s.hr]].map(([label, n]) => ({ label, v: div(n * 27, s.outs) }));
      composition = { kind: "per9", title: "9이닝 기준 결과", note: "9이닝을 던질 때 평균 몇 개씩 나오는지입니다. 삼진은 많을수록, 나머지는 적을수록 좋습니다.", player: per9(line), league: per9(L) };
    }

    // 월별 추이: 월마다 같은 지표를 다시 계산한다. 표본(타석·이닝)이 충분한 달만 좋고 나쁨을 표시한다
    let trend = null;
    if (monthly && monthly.length) {
      const keys = type === "batter" ? ["AVG", "OBP", "SLG", "OPS", "ISO"] : ["ERA", "WHIP", "K9", "BB9", "SO"];
      const ms = monthly.slice().sort((x, y) => (x.month < y.month ? -1 : 1));
      const enough = m => (type === "batter" ? m.pa >= 50 : m.outs >= 30);
      trend = {
        months: ms.map(m => ({ label: Number(m.month.slice(5)) + "월", size: type === "batter" ? `${m.pa}타석` : `${(m.outs / 3).toFixed(1)}이닝`, ok: enough(m) })),
        rows: keys.map(k => {
          const def = C.defs.find(d => d.key === k), vals = ms.map(m => def.calc(m));
          const okv = vals.filter((v, i) => v != null && enough(ms[i]));
          const best = okv.length > 1 ? (def.better === "high" ? Math.max(...okv) : Math.min(...okv)) : null;
          const worst = okv.length > 1 ? (def.better === "high" ? Math.min(...okv) : Math.max(...okv)) : null;
          return {
            label: def.label,
            cells: vals.map((v, i) => ({ display: fmtV(def, v), tone: !enough(ms[i]) || v == null ? "" : v === best ? "good" : v === worst ? "bad" : "" })),
          };
        }),
      };
    }

    // 구종 구성 (투수)
    let pitchMix = null;
    if (type === "pitcher" && mix && mix.length) {
      const tot = mix.reduce((a, m) => a + m.n, 0);
      pitchMix = mix.slice().sort((x, y) => y.n - x.n).map(m => ({ pitch: m.pitch, n: m.n, pct: (m.n / tot) * 100, kmh: m.kmh }));
    }

    // 비슷한 선수: 주요 지표 백분위 거리가 가까운 순서
    const sims = C.similarKeys.map(k => C.defs.find(d => d.key === k));
    const valsOf = d => qual.map(d.calc).filter(x => x != null);
    const allVals = sims.map(valsOf);
    const vec = s => sims.map((d, k) => pctOf(d, d.calc(s), allVals[k], false));
    const me = vec(line);
    const similar = qual.filter(r => r.pid !== pid).map(r => {
      const v = vec(r), pairs = v.map((x, k) => (x == null || me[k] == null ? null : Math.abs(x - me[k]))).filter(x => x != null);
      return { r, dist: pairs.length ? mean(pairs) : 999 };
    }).sort((a, b) => a.dist - b.dist).slice(0, 3).map(({ r, dist }) => ({
      name: r.name, team: teamName(r.team), pos: r.pos, similarity: Math.round(100 - dist),
      key: sims.slice(0, 3).map(d => `${d.label} ${fmtV(d, d.calc(r))}`).join(", "),
    }));

    const notes = [];
    if (!isQ) notes.push(`이 선수는 규정(${C.qualText(q)})을 채우지 못해 순위는 매기지 않았고, 백분위는 규정을 채운 ${C.noun} ${items[0].n}명과 비교한 참고용 값입니다.`);
    notes.push(`리그 평균과 백분위는 규정을 채운 ${C.noun} ${items[0].n}명을 기준으로 계산했습니다. 백분위 91은 리그 ${C.noun}의 91%보다 좋은 기록이라는 뜻이고, ${type === "pitcher" ? "ERA·WHIP처럼 낮을수록 좋은 지표도 같은 방향으로 맞췄습니다." : "삼진 비율처럼 낮을수록 좋은 지표도 같은 방향으로 맞췄습니다."}`);
    notes.push("한 시즌의 기록은 운과 표본 크기의 영향을 받습니다. 타자는 타석, 투수는 이닝이 적을수록 수치가 크게 흔들립니다.");
    notes.push(`${meta.note || "KBO 정규시즌 경기 기록입니다."} 2루타·3루타·사구·희생플라이는 투구별 기록의 타석 결과에서 집계해 공식 기록과 소폭 다를 수 있습니다.`);
    if (type === "pitcher") notes.push("수비 무관 평균자책(FIP)은 약식 상수 3.10을 사용한 값이라 공식 기록과 다를 수 있습니다.");

    return {
      version: 1, type, season: line.season, qualified: isQ, qualText: C.qualText(q), leagueN: items[0].n,
      subject: { name: line.name, team: teamName(line.team), pos: line.pos },
      headline, profile, items, strengths, weaknesses, composition, trend, pitchMix, similar, notes,
    };
  }

  // ---------- 화면 ----------
  const tone = t => (t === "good" ? "good" : t === "bad" ? "bad" : "");
  const miniPct = p => (p == null ? '<span class="muted">-</span>' :
    `<span class="mp" title="리그 ${top(p)}"><i style="width:${p}%"></i></span><b>${p}</b>`);

  function renderStack(c) {
    const colors = ["#8d9ab8", "#4a68d8", "#2146c7", "#d0312d"];
    const bar = (label, list) => `<div class="stk"><b>${label}</b><div class="stk-bar">${list.map((s, i) => s.pct > 0 ? `<span style="width:${s.pct}%;background:${colors[i]}" title="${s.label} ${s.pct.toFixed(0)}%">${s.pct >= 9 ? s.pct.toFixed(0) + "%" : ""}</span>` : "").join("")}</div></div>`;
    return bar("이 선수", c.player) + bar("리그", c.league) +
      `<div class="stk-legend">${c.player.map((s, i) => `<span><i style="background:${colors[i]}"></i>${s.label} ${s.n}개</span>`).join("")}</div>`;
  }
  function renderPer9(c) {
    const max = Math.max(...c.player.map(s => s.v || 0), ...c.league.map(s => s.v || 0), 1);
    return c.player.map((s, i) => {
      const lg = c.league[i].v, good = i === 0 ? s.v > lg : s.v < lg;
      return `<div class="tbar ${good ? "best" : ""}"><b>${s.label}</b><div class="tbar-track"><span class="tbar-fill" style="width:${(s.v || 0) / max * 100}%"></span><span class="tbar-avg" style="left:${(lg || 0) / max * 100}%"></span></div><span class="v">${s.v == null ? "-" : s.v.toFixed(1)}</span></div>`;
    }).join("") + '<p class="legend"><i style="background:#c8302a;width:3px"></i>리그 평균</p>';
  }

  function render(rep) {
    const isBat = rep.type === "batter";
    const profile = rep.profile.map(p => p.score == null ? "" : `
      <div class="grp"><div class="grp-h"><b>${esc(p.name)}</b><span>${esc(p.desc)}</span></div>
        <div class="grp-bar"><span class="grp-fill ${p.score >= 70 ? "hi" : p.score <= 30 ? "lo" : ""}" style="width:${p.score}%"></span></div>
        <div class="grp-v"><b>${p.score}</b><small>${top(p.score)}</small></div></div>`).join("");

    const listCards = (title, cls, list, empty) => `<div class="card2 ${cls}"><h3>${title}</h3>${list.length ? `<ul>${list.map(i =>
      `<li><b>${esc(i.label)}</b> ${esc(i.display)} <span class="muted">(리그 평균 ${esc(i.leagueDisplay)}, ${top(i.pct)})</span><br><small>${esc(i.desc)}</small></li>`).join("")}</ul>` : `<p class="muted">${empty}</p>`}</div>`;

    const groups = [...new Set(rep.items.map(i => i.group))];
    const table = groups.map(g => {
      const rows = rep.items.filter(i => i.group === g).map(i => `<tr><td>${esc(i.label)} <small class="muted">${esc(i.en)}</small></td><td>${esc(i.display)}</td><td>${esc(i.leagueDisplay)}</td>
        <td class="${tone(i.tone)}">${i.value == null ? "-" : esc(i.diffDisplay)}</td><td class="mpc">${miniPct(i.pct)}</td><td>${i.rank ? i.rank + "위" : "-"}</td></tr>`).join("");
      return `<tr class="gh"><td colspan="6">${esc(g)}</td></tr>${rows}`;
    }).join("");

    const trend = rep.trend ? `<section class="sec rep" id="r-trend"><h2>월별 추이</h2>
      <p class="sub">시즌 중 컨디션이 어떻게 변했는지 월별로 다시 계산했습니다. 표본이 충분한 달(${isBat ? "50타석" : "10이닝"} 이상)만 가장 좋은 달은 초록색, 가장 나쁜 달은 빨간색으로 표시합니다.</p>
      <div class="table-wrap"><table><thead><tr><th>지표</th>${rep.trend.months.map(m => `<th>${m.label}<br><small class="muted">${m.size}</small></th>`).join("")}</tr></thead><tbody>${rep.trend.rows.map(r =>
        `<tr><td>${esc(r.label)}</td>${r.cells.map(c => `<td class="${tone(c.tone)}">${esc(c.display)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>` : "";

    const mixColors = ["#2146c7", "#d0312d", "#17734f", "#8d9ab8", "#c9892b", "#7a4fc2", "#2f9bb0", "#555"];
    const pitchMix = rep.pitchMix ? `<section class="sec rep" id="r-mix"><h2>구종 구성</h2>
      <p class="sub">던진 공의 종류별 비율과 평균 구속입니다. 구속은 투구 추적 기록 기준입니다.</p>
      <div class="stk"><b>구종</b><div class="stk-bar">${rep.pitchMix.map((m, i) => `<span style="width:${m.pct}%;background:${mixColors[i % 8]}" title="${esc(m.pitch)} ${m.pct.toFixed(0)}%">${m.pct >= 9 ? esc(m.pitch) + " " + m.pct.toFixed(0) + "%" : ""}</span>`).join("")}</div></div>
      <div class="table-wrap"><table><thead><tr><th>구종</th><th>투구 수</th><th>비율</th><th>평균 구속</th></tr></thead><tbody>${rep.pitchMix.map((m, i) =>
        `<tr><td><i class="dot" style="background:${mixColors[i % 8]}"></i>${esc(m.pitch)}</td><td>${m.n}</td><td>${m.pct.toFixed(1)}%</td><td>${m.kmh.toFixed(1)}km/h</td></tr>`).join("")}</tbody></table></div></section>` : "";

    const similar = rep.similar.length ? `<section class="sec rep" id="r-similar"><h2>비슷한 유형의 ${isBat ? "타자" : "투수"}</h2>
      <p class="sub">주요 지표의 리그 위치가 가장 비슷한 선수입니다. 비슷한 정도가 100에 가까울수록 닮았습니다.</p>
      <div class="sim">${rep.similar.map(s => `<div class="sim-i"><b>${esc(s.name)}</b><span>${esc(s.team)} · ${esc(s.pos)}</span><em>비슷한 정도 ${s.similarity}</em><small>${esc(s.key)}</small></div>`).join("")}</div></section>` : "";

    const glossary = `<details class="gloss"><summary>지표 설명과 계산식 보기</summary><div class="table-wrap"><table><thead><tr><th>지표</th><th>계산식</th><th>뜻</th></tr></thead><tbody>${rep.items.map(i =>
      `<tr><td>${esc(i.label)} <small class="muted">${esc(i.en)}</small></td><td class="l">${esc(i.how)}</td><td class="l">${esc(i.desc)}</td></tr>`).join("")}</tbody></table></div></details>`;

    return `
      <nav class="rep-nav" aria-label="보고서 목차"><a href="#r-sum">종합 평가</a><a href="#r-prof">능력 프로필</a><a href="#r-all">전체 지표</a><a href="#r-comp">${rep.composition.title}</a>${rep.trend ? '<a href="#r-trend">월별 추이</a>' : ""}${rep.pitchMix ? '<a href="#r-mix">구종 구성</a>' : ""}${rep.similar.length ? '<a href="#r-similar">비슷한 선수</a>' : ""}<a href="#r-note">읽는 법</a></nav>
      <section class="sec rep" id="r-sum"><h2>종합 평가</h2>
        <p class="headline">${rep.headline}</p>
        <div class="two-cards">${listCards("강점", "pos", rep.strengths, "백분위를 계산할 수 있는 지표가 없습니다.")}${listCards("보완할 점", "neg", rep.weaknesses, "백분위를 계산할 수 있는 지표가 없습니다.")}</div></section>
      <section class="sec rep" id="r-prof"><h2>능력 프로필</h2>
        <p class="sub">${isBat ? "타격" : "투구"} 능력을 영역으로 나눠, 영역별 지표의 리그 백분위 평균을 보여 줍니다. 높을수록 리그에서 앞선 영역입니다.</p>
        <div class="groups">${profile}</div></section>
      <section class="sec rep" id="r-all"><h2>전체 지표</h2>
        <p class="sub">${isBat ? "타자" : "투수"}에게 필요한 지표 ${rep.items.length}개를 영역별로 정리했습니다. 위 분석에서 고른 지표만이 아니라 전부 계산했습니다.</p>
        <div class="table-wrap"><table class="alltab"><thead><tr><th>지표</th><th>선수 기록</th><th>리그 평균</th><th>차이</th><th>백분위</th><th>순위</th></tr></thead><tbody>${table}</tbody></table></div>
        ${glossary}</section>
      <section class="sec rep" id="r-comp"><h2>${rep.composition.title}</h2><p class="sub">${esc(rep.composition.note)}</p>
        ${rep.composition.kind === "stack" ? renderStack(rep.composition) : renderPer9(rep.composition)}</section>
      ${trend}${pitchMix}${similar}
      <section class="sec rep" id="r-note"><h2>읽을 때 알아둘 점</h2><ul class="plain">${rep.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></section>`;
  }

  window.Detail = { build, render, CFG };
})();
