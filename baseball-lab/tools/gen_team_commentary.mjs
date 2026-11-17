#!/usr/bin/env node
/* 팀별 AI 해설을 미리 만들어 public/data/team_commentary.json 으로 저장한다. (선수 해설과 같은 방식: gen_commentary.mjs)
 * LLM에는 우리가 계산한 수치(facts)만 주고, 결과 문장의 숫자가 facts에 없으면 버리고 다시 만든다.
 * 사용: node tools/gen_team_commentary.mjs [--force] [--dry] [--model claude-sonnet-5-5]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeTeams, TYPES } from "../src/lib/stats.js";
import { validate } from "./gen_commentary.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  for (const l of fs.readFileSync(path.join(ROOT, "tools/.env"), "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !l.trim().startsWith("#") && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* 파일이 없으면 환경변수만 사용 */ }
const DATA = path.join(ROOT, "public/data");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : (process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] == null ? true : process.argv[i + 1]); };
const MODEL = arg("model", "claude-sonnet-5-5"), FORCE = !!arg("force", false), DRY = !!arg("dry", false);
const OUT = path.join(DATA, "team_commentary.json");
const STR = new Set(["id", "name"]);
const readCsv = n => { const [h, ...ls] = fs.readFileSync(path.join(DATA, n + ".csv"), "utf8").replace(/^﻿/, "").trim().split(/\r?\n/), head = h.split(","); return ls.map(l => { const c = l.split(","), o = {}; head.forEach((k, i) => { o[k] = STR.has(k) ? c[i] : c[i] === "" || c[i] == null ? null : Number(c[i]); }); return o; }); };
const teams = readCsv("teams"), tf = JSON.parse(fs.readFileSync(path.join(DATA, "team_forecast.json"), "utf8"));
const KEYS = TYPES.team.defs.map(d => d.key);

/** 팀 한 곳의 사실 목록: 모든 팀 지표의 기록·리그 평균·리그 내 순위 + 예측 */
function factsOf(team, all) {
  const r = analyzeTeams(all, all.map(t => t.id), KEYS);
  const pick = m => { const sorted = m.items.slice().sort((a, b) => (m.better === "high" ? b.value - a.value : a.value - b.value)); const it = m.items.find(i => i.id === team.id); return { 지표: m.label, 기록: it.display, 리그평균: m.leagueDisplay, 순위: sorted.findIndex(i => i.id === team.id) + 1, 낮을수록좋음: m.better === "low" || undefined }; };
  const ms = r.metrics.map(pick), f = tf.teams[team.id];
  return {
    팀: team.name, 시즌: team.season, 비교집단: `${all.length}개 팀`, 경기: team.g, 승: team.w, 패: team.l, 무: team.d,
    지표: ms, 순위가좋은지표: ms.slice().sort((a, b) => a.순위 - b.순위).slice(0, 3), 순위가나쁜지표: ms.slice().sort((a, b) => b.순위 - a.순위).slice(0, 3),
    예측: f ? { 올해승률: f.now.wp, 예측: f.pred.map(p => ({ 시즌: p.year, 승률: p.wp, 범위: `${p.lo}~${p.hi}`, 예상승수: p.wins })), 주의: "승률 예측은 먼 미래일수록 .500에 가까워지고 오차가 큽니다" } : undefined,
  };
}

const SYSTEM = `당신은 야구 데이터를 처음 보는 사람에게 팀 성적을 쉬운 말로 설명하는 해설가입니다.
규칙:
- 아래 "사실" JSON에 있는 숫자와 이름만 사용하세요. 사실에 없는 숫자·선수·기록을 만들거나 계산해서 새 숫자를 만들지 마세요.
- 성적의 원인을 단정하지 말고 "~한 편입니다", "~로 보입니다"처럼 기록으로 말할 수 있는 만큼만 쓰세요.
- 예측은 "예측입니다", "오차가 큽니다"처럼 불확실성을 함께 말하세요. 한 시즌 기록이라는 한계도 한 번 언급하세요.
- "순위"는 같은 시즌 팀들 사이의 순위(1이 가장 좋음)입니다.
- 존댓말, 과장 없이 담백하게 쓰세요.
반드시 아래 JSON만 출력하세요(코드블록 없이):
{"summary":"2~3문장 총평","strengths":["강점 문장 1~2개"],"watch":["보완점 문장 1~2개"],"outlook":"예측에 대한 한 문장(예측이 없으면 빈 문자열)"}`;

async function ask(facts, feedback) {
  const msgs = [{ role: "user", content: `사실:\n${JSON.stringify(facts)}` + (feedback ? `\n\n이전 답변의 문제: ${feedback}\n사실에 있는 숫자만 써서 다시 작성하세요.` : "") }];
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: MODEL, max_tokens: 2500, system: SYSTEM, messages: msgs }) });
  if (!r.ok) throw new Error(`API ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).content.map(c => c.text || "").join("");
}

async function main() {
  const out = fs.existsSync(OUT) && !FORCE ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const todo = teams.filter(t => FORCE || !out[`${t.season}-${t.id}`]);
  console.log(`대상 ${todo.length}개 팀 (모델 ${MODEL}${DRY ? ", dry" : ""})`);
  if (DRY) { if (todo[0]) console.log(JSON.stringify(factsOf(todo[0], teams), null, 1)); return; }
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY 환경변수 또는 tools/.env 가 필요합니다."); process.exit(1); }
  let done = 0, fail = 0;
  for (const t of todo) {
    const facts = factsOf(t, teams); let fb = null, ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      try {
        const raw = await ask(facts, fb), m = raw.match(/\{[\s\S]*\}/); let j; try { j = JSON.parse(m ? m[0] : raw); } catch { fb = "JSON 형식이 아닙니다"; continue; }
        const why = validate(JSON.stringify(j), { ...facts, 비슷한선수: [] });
        if (why) { fb = why; continue; }
        out[`${t.season}-${t.id}`] = { ...j, model: MODEL, name: t.name }; ok = true; done++;
      } catch (e) { fb = e.message; console.warn(`  오류 ${t.name}: ${e.message}`); }
    }
    if (!ok) { fail++; console.warn(`  실패 ${t.name}: ${fb}`); }
  }
  fs.writeFileSync(OUT, JSON.stringify(out)); console.log(`완료 ${done}개, 실패 ${fail}개 → ${path.relative(ROOT, OUT)}`);
}
main();
