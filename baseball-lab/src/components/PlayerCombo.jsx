import { useEffect, useMemo, useRef, useState } from "react";

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const initials = str => [...str].map(ch => { const c = ch.charCodeAt(0) - 44032; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; }).join("");

/** 검색해서 고르는 선수 입력칸: 이름, 팀, 포지션, 초성으로 찾고 방향키·Enter·Esc를 지원한다 */
import { pitcherQual } from "../lib/role.js";
export default function PlayerCombo({ rows, type, value, qualify, teamName, hasError, label, onPick, id = "player" }) {
  const cur = rows.find(p => p.pid === value);
  const curLabel = cur ? `${cur.name} · ${teamName(cur.team)} · ${cur.pos}` : "";
  const [text, setText] = useState(curLabel);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const typed = useRef(false);   // 사용자가 직접 입력한 상태인지 (처음 열 때는 전체 목록을 보여 준다)
  const listRef = useRef(null);
  useEffect(() => { setText(curLabel); typed.current = false; }, [curLabel]);

  const items = useMemo(() => {
    const q = (typed.current ? text : "").trim().toLowerCase().replace(/\s+/g, "");
    const size = p => (type === "batter" ? p.pa : p.outs);
    const hay = p => [(p.name + teamName(p.team) + p.pos).toLowerCase(), initials(p.name) + initials(teamName(p.team)) + p.pos.toLowerCase()];
    const hit = q ? rows.filter(p => hay(p).some(h => h.includes(q))) : rows.slice();
    const first = p => (p.name.toLowerCase().startsWith(q) || initials(p.name).startsWith(q) ? 0 : 1);
    return hit.sort((a, b) => first(a) - first(b) || size(b) - size(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, text, type, open]);
  const MAX = 40, shown = items.slice(0, MAX);

  useEffect(() => { setIdx(0); }, [text, open]);
  useEffect(() => { const li = listRef.current?.querySelector('[aria-selected="true"]'); if (li) li.scrollIntoView({ block: "nearest" }); }, [idx]);

  const pick = p => { setOpen(false); typed.current = false; onPick(p.pid); };
  const close = () => { setOpen(false); typed.current = false; setText(curLabel); };   // 고르지 않고 닫으면 원래 선택으로 되돌린다
  const isQ = p => (type === "batter" ? p.pa >= qualify.batterPa : pitcherQual(p, qualify));

  return (
    <div className="combo">
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className={"field" + (hasError ? " err" : "")} type="text" role="combobox" aria-expanded={open} aria-controls={id + "-list"} aria-autocomplete="list"
        aria-activedescendant={open && shown.length ? `${id}-o${idx}` : undefined} autoComplete="off" spellCheck={false}
        placeholder="이름, 팀, 포지션으로 검색 (예: 김도영, ㄱㄷㅇ)" value={text}
        onFocus={e => { setOpen(true); if (cur && text === curLabel) e.target.select(); }}
        onChange={e => { typed.current = true; setText(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(close, 120)}
        onKeyDown={e => {
          if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else setIdx(i => (i + 1) % Math.max(shown.length, 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => (i - 1 + shown.length) % Math.max(shown.length, 1)); }
          else if (e.key === "Enter") { if (open && shown[idx]) { e.preventDefault(); pick(shown[idx]); } }
          else if (e.key === "Escape") close();
        }} />
      <ul className="combo-list" id={id + "-list"} role="listbox" hidden={!open} ref={listRef}>
        {shown.map((p, i) => (
          <li key={p.pid} role="option" id={`${id}-o${i}`} aria-selected={i === idx} onMouseDown={e => { e.preventDefault(); pick(p); }}>
            <b>{p.name}</b><span>{teamName(p.team)} · {p.pos}</span>{!isQ(p) && <em>규정 미달</em>}
          </li>
        ))}
        {items.length > MAX && <li className="combo-more" aria-hidden="true">외 {items.length - MAX}명 · 검색어를 입력해 좁혀 보세요</li>}
        {!items.length && <li className="combo-more" aria-hidden="true">검색 결과가 없어요. 이름이나 팀을 다시 확인해 주세요.</li>}
      </ul>
    </div>
  );
}
