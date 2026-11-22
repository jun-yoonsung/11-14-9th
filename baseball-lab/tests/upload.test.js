import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, readPlayers, parseInnings, TEMPLATES } from "../src/lib/upload.js";

test("parseCsv handles BOM, quotes with commas, CRLF and tab-separated text", () => {
  assert.deepEqual(parseCsv("﻿a,b\r\n\"x,y\",2\r\n"), [["a", "b"], ["x,y", "2"]]);
  assert.deepEqual(parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCsv("a,b\n\n1,2\n"), [["a", "b"], ["1", "2"]]);    // 빈 줄은 건너뛴다
});

test("parseInnings converts baseball innings notation to outs", () => {
  assert.equal(parseInnings("100"), 300); assert.equal(parseInnings("100.1"), 301); assert.equal(parseInnings("100.2"), 302);
  assert.equal(parseInnings("100 1/3"), 301); assert.equal(parseInnings("5.33"), 16); assert.equal(parseInnings("5.67"), 17);
  assert.equal(parseInnings("abc"), null); assert.equal(parseInnings("-1"), null); assert.equal(parseInnings("5.5"), null);   // .5는 야구 표기에 없다
});

const BAT = "선수,팀,경기,타수,안타,2루타,3루타,홈런,타점,득점,볼넷,사구,삼진,희생플라이\n김타자,내팀,100,400,120,20,2,15,70,60,40,5,80,4\n";
test("readPlayers (batter): Korean headers, derives PA, keeps numbers", () => {
  const r = readPlayers(BAT, "batter");
  assert.equal(r.errors.length, 0); assert.equal(r.players.length, 1);
  const p = r.players[0];
  assert.equal(p.name, "김타자"); assert.equal(p.ab, 400); assert.equal(p.h, 120); assert.equal(p.pa, 449);   // 400+40+5+4
  assert.ok(p.pid.startsWith("u"));
});

test("readPlayers (batter): English headers work; missing required column is reported and nothing is analysed", () => {
  const ok = readPlayers("name,ab,h,d2,d3,hr,bb,so\nKim,300,90,10,1,8,30,60\n", "batter");
  assert.equal(ok.players.length, 1); assert.ok(ok.warnings.some(w => /hbp|사구/.test(w)), "없는 선택 열은 0으로 두었다고 알린다");
  const bad = readPlayers("name,ab,h\nKim,300,90\n", "batter");
  assert.equal(bad.players.length, 0); assert.ok(bad.errors.some(e => /2루타|d2/.test(e)));
});

test("readPlayers (batter): impossible rows are skipped with the row number", () => {
  const r = readPlayers(BAT + "박오류,내팀,10,10,30,0,0,0,0,0,0,0,0,0\n최음수,내팀,10,10,3,0,0,0,0,0,-2,0,0,0\n", "batter");
  assert.equal(r.players.length, 1);
  assert.equal(r.errors.length, 2); assert.ok(/3행/.test(r.errors[0]) && /안타/.test(r.errors[0])); assert.ok(/4행/.test(r.errors[1]));
});

const PIT = "이름,팀,경기,선발,이닝,피안타,볼넷,사구,삼진,피홈런,자책점,실점\n이투수,내팀,25,25,150.1,140,40,5,130,12,55,60\n김불펜,내팀,50,0,60.2,50,20,2,70,5,20,22\n";
test("readPlayers (pitcher): innings to outs, role from starts, pos column wins", () => {
  const r = readPlayers(PIT, "pitcher");
  assert.equal(r.errors.length, 0); assert.equal(r.players.length, 2);
  assert.equal(r.players[0].outs, 451); assert.equal(r.players[0].pos, "선발");
  assert.equal(r.players[1].outs, 182); assert.equal(r.players[1].pos, "구원");
  const withPos = readPlayers("name,pos,ip,h,bb,so,hr,er\nA,구원,70,60,20,80,5,25\n", "pitcher");
  assert.equal(withPos.players[0].pos, "구원");
});

test("readPlayers: unknown file, empty file and too many rows give a clear error", () => {
  assert.ok(readPlayers("", "batter").errors.length > 0);
  assert.ok(readPlayers("a,b\n1,2\n", "pitcher").errors.length > 0);
  const many = "name,ab,h,d2,d3,hr,bb,so\n" + Array.from({ length: 2001 }, (_, i) => `P${i},10,3,0,0,0,1,2`).join("\n");
  assert.ok(readPlayers(many, "batter").errors.some(e => /2000/.test(e)));
});

test("TEMPLATES parse cleanly with their own reader (the sample file we hand out must work)", () => {
  assert.equal(readPlayers(TEMPLATES.batter, "batter").errors.length, 0);
  assert.equal(readPlayers(TEMPLATES.pitcher, "pitcher").errors.length, 0);
  assert.ok(readPlayers(TEMPLATES.batter, "batter").players.length >= 2);
});
