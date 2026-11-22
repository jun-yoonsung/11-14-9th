/* 내 데이터 업로드: 사용자가 가진 시즌 기록 파일(CSV·엑셀에서 저장한 CSV/탭 구분)을 읽어 선수 줄로 만든다. 순수 함수.
 * 파일은 서버로 올라가지 않고 이 브라우저 안에서만 읽는다. 사이트 기록과 같은 열 이름(stats.js가 쓰는 pa, ab, h ...)으로 바꿔 준다. */

export const MAX_ROWS = 2000, MAX_BYTES = 2 * 1024 * 1024;

/** CSV 읽기: BOM·큰따옴표(안의 쉼표)·CRLF·빈 줄을 처리하고, 첫 줄에 탭이 더 많으면 탭으로 나눈다(엑셀에서 복사한 표) */
export function parseCsv(text) {
  const t = String(text).replace(/^﻿/, "");
  const first = t.split(/\r?\n/, 1)[0] || "";
  const sep = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? "\t" : ",";
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some(x => x.trim() !== "")) rows.push(row.map(x => x.trim())); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim() !== "")) rows.push(row.map(x => x.trim()));
  return rows;
}

/** 이닝 표기를 아웃 수로: "100"→300, "100.1"→301, "100.2"→302, "100 1/3"→301, "5.33"→16, "5.67"→17. 읽을 수 없으면 null */
export function parseInnings(s) {
  const v = String(s).trim(); let m;
  if ((m = /^(\d+)\s+([12])\/3$/.exec(v))) return +m[1] * 3 + +m[2];
  if ((m = /^(\d+)(?:\.(\d+))?$/.exec(v))) {
    const whole = +m[1], f = m[2];
    if (f === undefined) return whole * 3;
    if (f === "0") return whole * 3;
    if (f === "1" || f === "2") return whole * 3 + +f;
    const x = Number("0." + f);
    if (Math.abs(x - 1 / 3) < 0.02) return whole * 3 + 1;
    if (Math.abs(x - 2 / 3) < 0.02) return whole * 3 + 2;
  }
  return null;
}

// 열 이름 별칭(소문자·공백 제거 후 비교). 키는 stats.js가 쓰는 이름.
const A = {
  name: ["name", "선수", "선수명", "이름"], team: ["team", "팀", "소속"], pos: ["pos", "보직", "역할", "포지션"],
  g: ["g", "경기", "경기수"], gs: ["gs", "선발", "선발경기", "선발등판"],
  pa: ["pa", "타석"], ab: ["ab", "타수"], h: ["h", "안타", "피안타"], d2: ["d2", "2b", "2루타"], d3: ["d3", "3b", "3루타"], hr: ["hr", "홈런", "피홈런"],
  rbi: ["rbi", "타점"], r: ["r", "득점", "실점"], bb: ["bb", "볼넷", "4구"], hbp: ["hbp", "사구", "몸에맞는공"], so: ["so", "k", "삼진", "탈삼진"], sf: ["sf", "희생플라이", "희플"],
  ip: ["ip", "이닝"], outs: ["outs", "아웃", "아웃수"], er: ["er", "자책", "자책점"],
};
const norm = s => String(s).toLowerCase().replace(/[\s_%()]/g, "");
const KO = { d2: "2루타(d2)", d3: "3루타(d3)", ab: "타수(ab)", h: "안타(h)", hr: "홈런(hr)", bb: "볼넷(bb)", so: "삼진(so)", ip: "이닝(ip) 또는 아웃(outs)", er: "자책점(er)", name: "선수 이름(name)",
  hbp: "사구(hbp)", sf: "희생플라이(sf)", rbi: "타점(rbi)", r: "득점·실점(r)", g: "경기(g)", gs: "선발(gs)", pa: "타석(pa)" };

const SPEC = {
  batter: { need: ["name", "ab", "h", "d2", "d3", "hr", "bb", "so"], opt: ["hbp", "sf", "rbi", "r", "g"], text: ["team", "pos"] },
  pitcher: { need: ["name", "h", "bb", "so", "hr", "er"], opt: ["hbp", "r", "g", "gs"], text: ["team", "pos"] },
};

/** 파일 글자 → 선수 줄들. 반환 {players, errors, warnings}. errors에 열 부족·행 오류가 있으면 그 행은 빠진다 */
export function readPlayers(text, type) {
  const spec = SPEC[type], out = { players: [], errors: [], warnings: [] };
  const rows = parseCsv(text);
  if (rows.length < 2) { out.errors.push("내용이 비어 있어요. 첫 줄은 열 이름, 그 아래부터 선수 기록이어야 해요."); return out; }
  if (rows.length - 1 > MAX_ROWS) { out.errors.push(`선수가 ${MAX_ROWS}명보다 많아요(${rows.length - 1}행). 나눠서 올려 주세요.`); return out; }
  const head = rows[0].map(norm), col = {};
  for (const k of Object.keys(A)) { const i = head.findIndex(h => A[k].includes(h)); if (i >= 0) col[k] = i; }
  // 투수 이닝: ip 또는 outs 둘 중 하나
  const need = type === "pitcher" ? spec.need.concat(col.ip !== undefined || col.outs !== undefined ? [] : ["ip"]) : spec.need;
  const missing = need.filter(k => col[k] === undefined);
  if (missing.length) { out.errors.push(`필요한 열이 없어요: ${missing.map(k => KO[k] || k).join(", ")}. 아래 "예시 파일"의 첫 줄과 비교해 보세요.`); return out; }
  const absent = spec.opt.filter(k => col[k] === undefined);
  if (absent.length) out.warnings.push(`없는 열은 0으로 계산했어요: ${absent.map(k => KO[k] || k).join(", ")}. 이 열이 필요한 지표는 실제와 다를 수 있어요.`);
  if (type === "pitcher" && col.pos === undefined && col.gs === undefined) out.warnings.push("보직(pos) 열도 선발(gs) 열도 없어서 모두 선발 투수로 보고 선발끼리 비교했어요.");

  const num = (cells, k, r, rowNo) => {
    if (col[k] === undefined) return 0;
    const raw = cells[col[k]]; if (raw === undefined || raw === "") return 0;
    const v = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(v) || v < 0) { r.push(`${rowNo}행: ${KO[k] || k} 값 "${raw}"을(를) 읽을 수 없어요(0 이상 숫자여야 해요).`); return 0; }
    return v;
  };
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i], rowNo = i + 1, errs = [], name = (cells[col.name] || "").trim();
    if (!name) { out.errors.push(`${rowNo}행: 선수 이름이 비어 있어요.`); continue; }
    const p = { pid: "u" + i, id: "u" + i, name, team: col.team !== undefined ? cells[col.team] || "내 팀" : "내 팀", season: null };
    for (const k of [...spec.need, ...spec.opt]) if (k !== "name" && !(type === "pitcher" && k === "ip")) p[k] = num(cells, k, errs, rowNo);
    if (type === "batter") {
      p.pa = col.pa !== undefined && cells[col.pa] !== "" ? num(cells, "pa", errs, rowNo) : p.ab + p.bb + p.hbp + p.sf;
      if (p.h > p.ab) errs.push(`${rowNo}행: 안타(${p.h})가 타수(${p.ab})보다 많아요.`);
      else if (p.d2 + p.d3 + p.hr > p.h) errs.push(`${rowNo}행: 2루타+3루타+홈런(${p.d2 + p.d3 + p.hr})이 안타(${p.h})보다 많아요.`);
      else if (p.so > p.pa) errs.push(`${rowNo}행: 삼진(${p.so})이 타석(${p.pa})보다 많아요.`);
      p.pos = col.pos !== undefined ? cells[col.pos] || "" : "";
    } else {
      let outs = null;
      if (col.outs !== undefined && cells[col.outs] !== "") outs = Number(cells[col.outs]);
      else if (col.ip !== undefined) outs = parseInnings(cells[col.ip]);
      if (!Number.isInteger(outs) || outs < 0) errs.push(`${rowNo}행: 이닝 "${cells[col.ip ?? col.outs]}"을(를) 읽을 수 없어요(예: 150, 150.1, 150.2).`);
      p.outs = outs ?? 0;
      if (p.er > p.r && col.r !== undefined) errs.push(`${rowNo}행: 자책점(${p.er})이 실점(${p.r})보다 많아요.`);
      if (!col.r) p.r = p.er;
      p.pos = col.pos !== undefined && cells[col.pos] ? (/구원|불펜|릴리|RP/i.test(cells[col.pos]) ? "구원" : "선발")
        : col.gs !== undefined && p.g > 0 ? (p.gs * 2 >= p.g ? "선발" : "구원") : "선발";
      p.hand = "";
    }
    if (errs.length) { out.errors.push(...errs); continue; }
    out.players.push(p);
  }
  if (!out.players.length && !out.errors.length) out.errors.push("읽을 수 있는 선수가 없어요.");
  return out;
}

/** 내려받기용 예시 파일(이 사이트가 읽을 수 있는 형식) */
export const TEMPLATES = {
  batter: "선수,팀,경기,타수,안타,2루타,3루타,홈런,타점,득점,볼넷,사구,삼진,희생플라이\n김타자,우리팀,100,380,115,20,2,14,66,58,42,5,78,4\n박안타,우리팀,95,340,102,15,1,6,41,49,30,3,52,2\n",
  pitcher: "선수,팀,경기,선발,이닝,피안타,볼넷,사구,삼진,피홈런,자책점,실점\n이선발,우리팀,25,25,150.1,140,40,5,130,12,55,60\n최불펜,우리팀,50,0,60.2,50,20,2,70,5,20,22\n",
};
