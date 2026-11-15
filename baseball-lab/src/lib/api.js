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
  batters(season) { return this.csv("batters").then(l => l.filter(x => x.season === season)); },
  pitchers(season) { return this.csv("pitchers").then(l => l.filter(x => x.season === season)); },
  teams(season) { return this.csv("teams").then(l => l.filter(x => x.season === season)); },
  monthly(type, pid) { return this.csv(type === "batter" ? "batters_monthly" : "pitchers_monthly").then(l => l.filter(x => x.pid === pid)); },
  pitchmix(pid) { return this.csv("pitchmix").then(l => l.filter(x => x.pid === pid)); },
};
