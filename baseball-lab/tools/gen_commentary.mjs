#!/usr/bin/env node
/* 선수별 AI 해설을 미리 만들어 public/data/commentary.json 으로 저장한다.
 *
 * 왜 미리 만드나: 사이트(정적 호스팅)에서 LLM을 바로 부르면 API 키가 노출되고, 호출마다 비용·대기 시간이 생기고, 같은 선수도 문장이 달라진다.
 * 그래서 내 컴퓨터에서 한 번만 만들어 파일로 저장하고, 사이트는 그 파일만 읽는다. (키는 사이트에 들어가지 않는다)
 *
 * 환각 방지: LLM에는 우리가 계산한 수치(facts)만 주고, 결과 문장에 나온 숫자가 facts에 없으면 버리고 다시 만든다.
 *
 * 사용: ANTHROPIC_API_KEY=... node tools/gen_commentary.mjs [--limit 10] [--only 50464,50030] [--force] [--dry] [--model claude-sonnet-5-5]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../src/lib/detail.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// tools/.env 파일에 적어 둔 ANTHROPIC_API_KEY를 읽는다 (환경변수가 이미 있으면 그것을 우선)
try {
  for (const l of fs.readFileSync(path.join(ROOT, "tools/.env"), "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !l.trim().startsWith("#") && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* 파일이 없으면 환경변수만 사용 */ }
const DATA = path.join(ROOT, "public/data");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : (process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] == null ? true : process.argv[i + 1]); };
const MODEL = arg("model", "claude-sonnet-5-5"), LIMIT = Number(arg("limit", 0)) || Infinity, ONLY = arg("only", "") ? String(arg("only")).split(",") : null;
const OUT = arg("out", path.join(DATA, "commentary.json")), DRY = !!arg("dry", false), FORCE = !!arg("force", false), MOCK = !!arg("mock", false);

const STR = new Set(["pid", "id", "name", "team", "pos", "hand", "month", "pitch"]);
const readCsv = n => {
  const [h, ...ls] = fs.readFileSync(path.join(DATA, n + ".csv"), "utf8").replace(/^﻿/, "").trim().split(/\r?\n/), head = h.split(",");
  return ls.map(l => { const c = l.split(","), o = {}; head.forEach((k, i) => { o[k] = STR.has(k) ? c[i] : c[i] === "" || c[i] == null ? null : Number(c[i]); }); return o; });
};
const meta = JSON.parse(fs.readFileSync(path.join(DATA, "meta.json"), "utf8"));
const bats = readCsv("batters"), pits = readCsv("pitchers"), bm = readCsv("batters_monthly"), pm = readCsv("pitchers_monthly"), mixAll = readCsv("pitchmix");

/** 해설에 쓸 수 있는 사실 목록. 여기에 없는 숫자는 해설에 나오면 안 된다. */
function factsOf(rep) {
  const it = rep.items.filter(i => i.pct != null);
  const pick = i => ({ 지표: i.label, 기록: i.display, 리그평균: i.leagueDisplay, 백분위: i.pct, 순위: i.rank || undefined });
  const sorted = it.slice().sort((a, b) => b.pct - a.pct);
  return {
    선수: rep.subject.name, 팀: rep.subject.team, 포지션: rep.subject.pos, 시즌: rep.season, 비교집단: `${rep.noun} ${rep.leagueN}명`, 규정충족: rep.qualified,
    종합: String(rep.headline).replace(/<[^>]+>/g, ""),
    강점: sorted.filter(i => i.pct >= 60).slice(0, 5).map(pick), 약점: sorted.filter(i => i.pct <= 40).slice(-4).reverse().map(pick),
    영역별: (rep.profile || []).map(p => ({ 영역: p.name || p.label, 점수: p.score ?? p.pct })),   // 영역 점수는 리그 백분위 평균(높을수록 좋음)
    비슷한선수: rep.similar.map(s => ({ 이름: s.name, 팀: s.team, 비슷한정도: s.similarity })),
    월별: rep.trend ? rep.trend.months.map(m => m.label + " " + m.size) : undefined,
  };
}

const SYSTEM = `당신은 야구 데이터를 처음 보는 사람에게 선수 기록을 쉬운 말로 설명하는 해설가입니다.
규칙:
- 아래 "사실" JSON에 있는 숫자와 이름만 사용하세요. 사실에 없는 숫자·선수·팀·기록을 만들거나 계산해서 새 숫자를 만들지 마세요.
- 성적의 원인이나 미래를 단정하지 말고 "~한 편입니다", "~로 보입니다"처럼 기록으로 말할 수 있는 만큼만 쓰세요.
- 한 시즌 기록이므로 표본이 작으면(규정 미충족) 그 한계를 한 문장으로 언급하세요.
- 어려운 용어(wOBA, FIP, ISO 등)는 처음 나올 때 한 구절로 풀어 쓰세요.
- 존댓말, 과장 없이 담백하게 쓰세요.
반드시 아래 JSON만 출력하세요(코드블록 없이):
{"summary":"2~3문장 총평","strengths":["강점 문장 2~3개"],"watch":["보완점 또는 주의할 점 1~2개"],"style":"이 선수가 어떤 유형인지 한 문장","similar":"비슷한 선수가 있다면 왜 닮았는지 한 문장(없으면 빈 문자열)"}`;

const numsIn = s => (String(s).match(/\d+(?:[.,]\d+)?|\.\d+/g) || []).map(x => String(Number(x.replace(/,/g, "")))).filter(x => x !== "NaN");
/** 결과 문장의 숫자가 모두 사실 JSON에 있는지 확인한다. 어긋나면 이유를 돌려준다. */
export function validate(text, facts) {
  const allowed = new Set(numsIn(JSON.stringify(facts)));
  ["0", "1", "2", "3", "5", "100"].forEach(x => allowed.add(x));   // 개수 표현(2~3문장, 상위 5명 등)과 퍼센트 기준은 허용
  const bad = [...new Set(numsIn(text).filter(n => !allowed.has(n)))];
  const names = new Set([facts.선수, ...facts.비슷한선수.map(s => s.이름)]);
  return bad.length ? `사실에 없는 숫자: ${bad.join(", ")}` : (names.size ? null : null);
}

async function ask(facts, feedback) {
  if (MOCK) return JSON.stringify({ summary: `${facts.선수}의 기록입니다.`, strengths: [], watch: [], style: "", similar: "" });
  const msgs = [{ role: "user", content: `사실:\n${JSON.stringify(facts)}` + (feedback ? `\n\n이전 답변의 문제: ${feedback}\n사실에 있는 숫자만 써서 다시 작성하세요.` : "") }];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2500, system: SYSTEM, messages: msgs }),
  });
  if (!r.ok) throw new Error(`API ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).content.map(c => c.text || "").join("");
}

async function one(type, row) {
  const rows = type === "batter" ? bats : pits, ms = (type === "batter" ? bm : pm).filter(x => x.pid === row.pid), mix = type === "pitcher" ? mixAll.filter(x => x.pid === row.pid) : null;
  const rep = build(type, rows, row.pid, meta.qualify, meta, ms, mix), facts = factsOf(rep);
  if (DRY) return { facts };
  let fb = null;
  for (let t = 0; t < 3; t++) {
    const raw = await ask(facts, fb);
    let j; try { const m = raw.match(/\{[\s\S]*\}/); j = JSON.parse(m ? m[0] : raw); } catch { fb = "JSON 형식이 아닙니다"; if (process.env.DEBUG_RAW) console.warn("  원문:", raw.slice(0, 300)); continue; }
    const why = validate(JSON.stringify(j), facts);
    if (!why) return { text: j, model: MODEL, season: row.season };
    fb = why;
  }
  return { failed: fb };
}

async function main() {
  const out = fs.existsSync(OUT) && !FORCE ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const todo = [...bats.map(r => ["batter", r]), ...pits.map(r => ["pitcher", r])]
    .filter(([ty, r]) => (ONLY ? ONLY.includes(r.pid) : (ty === "batter" ? r.pa >= 100 : r.outs >= 90)) && (FORCE || !out[`${r.season}-${r.pid}`])).slice(0, LIMIT);
  console.log(`대상 ${todo.length}명 (모델 ${MODEL}${DRY ? ", dry" : ""}${MOCK ? ", mock" : ""})`);
  if (!DRY && !MOCK && !process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY 환경변수가 필요합니다."); process.exit(1); }
  let done = 0, fail = 0, i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const [ty, r] = todo[i++];
      try {
        const res = await one(ty, r);
        if (DRY) { if (i === 1) console.log(JSON.stringify(res.facts, null, 1)); continue; }
        if (res.text) { out[`${r.season}-${r.pid}`] = { ...res.text, model: res.model, name: r.name }; done++; } else { fail++; console.warn(`  실패 ${r.name}: ${res.failed}`); }
      } catch (e) { fail++; console.warn(`  오류 ${r.name}: ${e.message}`); }
      if ((done + fail) % 20 === 0) fs.writeFileSync(OUT, JSON.stringify(out));
    }
  };
  await Promise.all(Array.from({ length: DRY ? 1 : 4 }, worker));
  if (!DRY) { fs.writeFileSync(OUT, JSON.stringify(out)); console.log(`완료 ${done}명, 실패 ${fail}명 → ${path.relative(ROOT, OUT)}`); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
