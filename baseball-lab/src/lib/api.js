/* 실제 KBO 데이터 읽기: public/data 의 CSV·JSON이 DB 역할(build_data.py가 만듦). Firebase가 켜져 있으면 Firestore에서 먼저 읽는다. */
import { cloud, cloudEnabled } from "./cloud.js";
import { CONFIG } from "../config.js";
import { BASE } from "./format.js";

const cache = {};
const STR = new Set(["pid", "id", "name", "team", "pos", "hand", "month", "pitch"]);
const fromDb = () => cloudEnabled && CONFIG.dataFromDb;
const file = (name, ext) => fetch(`${BASE}data/${name}.${ext}`).then(r => { if (!r.ok) throw new Error(`${name}.${ext} ${r.status}`); return ext === "json" ? r.json() : r.text(); });

const parse = t => {
  const lines = t.replace(/^﻿/, "").trim().split(/\r?\n/), head = lines[0].split(",");
  return lines.slice(1).map(l => {
    const c = l.split(","), o = {};
    head.forEach((h, i) => { o[h] = STR.has(h) ? c[i] : c[i] === "" || c[i] == null ? null : Number(c[i]); });
    return o;
  });
};

export const Api = {
  json(name) {
    if (!cache[name]) cache[name] = fromDb() && name === "meta" ? cloud.readMeta().catch(() => file(name, "json")) : file(name, "json");
    return cache[name];
  },
  csv(name) {
    const key = name + ".csv";
    if (!cache[key]) cache[key] = (fromDb() ? cloud.readCsvText(name).catch(() => file(name, "csv")) : file(name, "csv")).then(parse);
    return cache[key];
  },
  meta() { return this.json("meta"); },
  // 미리 학습해 둔 예측 결과(ml/train_forecast.py가 만듦). 없으면 null
  forecast() { if (!cache.forecast) cache.forecast = file("forecast", "json").catch(() => null); return cache.forecast; },
  // 미리 만들어 둔 AI 해설. 파일이 없으면 빈 객체(해설 없이 보여 준다)
  commentary() { if (!cache.commentary) cache.commentary = file("commentary", "json").catch(() => ({})); return cache.commentary; },
  // 선수별 시즌 기록(커리어)과 시즌별 리그 평균 (ml/build_career.py)
  career() { if (!cache.career) cache.career = file("career", "json").catch(() => null); return cache.career; },
  // 팀 승률 예측과 팀 역대 성적 (ml/train_team.py), 팀 AI 해설 (tools/gen_team_commentary.mjs)
  teamForecast() { if (!cache.teamForecast) cache.teamForecast = file("team_forecast", "json").catch(() => null); return cache.teamForecast; },
  teamCommentary() { if (!cache.teamCommentary) cache.teamCommentary = file("team_commentary", "json").catch(() => ({})); return cache.teamCommentary; },
  batters(season) { return this.csv("batters").then(l => l.filter(x => x.season === season)); },
  pitchers(season) { return this.csv("pitchers").then(l => l.filter(x => x.season === season)); },
  teams(season) { return this.csv("teams").then(l => l.filter(x => x.season === season)); },
  monthly(type, pid) { return this.csv(type === "batter" ? "batters_monthly" : "pitchers_monthly").then(l => l.filter(x => x.pid === pid)); },
  pitchmix(pid) { return this.csv("pitchmix").then(l => l.filter(x => x.pid === pid)); },
};
