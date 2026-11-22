import { useId, useRef } from "react";
import { TYPES } from "../lib/stats.js";
import { tipOf } from "../lib/metricHelp.js";

/** 말풍선: 올리거나 키보드로 이동·탭하면 바로 뜬다(뜻 · 계산식 · 좋고 나쁨 방향).
 *  fixed로 띄워 표(table-wrap)처럼 가로 스크롤 칸 안에서도 잘리지 않고, 화면 가장자리·아래쪽에서는 안쪽·위쪽으로 옮겨 놓는다. */
function useTip() {
  const tip = useRef(null), anchor = useRef(null);
  const fit = () => {
    const el = tip.current, a = anchor.current; if (!el || !a) return;
    const r = a.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight, w = el.offsetWidth, h = el.offsetHeight;
    const left = Math.max(8, Math.min(r.left, vw - w - 8)), below = r.bottom + 8 + h <= vh - 8 || r.top - 8 - h < 8, top = below ? r.bottom + 8 : r.top - 8 - h;
    el.style.left = left + "px"; el.style.top = top + "px"; el.classList.toggle("up", !below);
    el.style.setProperty("--sx", Math.max(14, Math.min(r.left + Math.min(r.width / 2, 40) - left, w - 24)) + "px");
  };
  return { tip, anchor, fit };
}

function Bubble({ id, tipRef, def, type }) {
  const t = tipOf(type, def);
  return (
    <span className="mtip" role="tooltip" id={id} ref={tipRef}>
      <b>{def.label}{def.label !== def.en ? <i> {def.en}</i> : null}</b>
      {t.meaning && <span className="m">{t.meaning}</span>}
      <span className="h">계산: {t.how}</span>
      {t.dir && <span className="d">{t.dir}</span>}
    </span>
  );
}

/** 지표 선택 칩 */
export default function MetricChip({ def, type, pressed, onToggle }) {
  const id = useId(), { tip, anchor, fit } = useTip();
  return (
    <span className="mchip" onMouseEnter={fit} onFocus={fit}>
      <button ref={anchor} className="chip" type="button" aria-pressed={pressed} aria-describedby={id} onClick={onToggle}>{def.label}{def.label !== def.en ? " " + def.en : ""}</button>
      <Bubble id={id} tipRef={tip} def={def} type={type} />
    </span>
  );
}

/** 결과·표 안의 지표 이름: 글자 모양은 그대로 두고 올리면 말풍선만 뜬다. 모르는 지표면 글자만 보여 준다. */
export function MetricName({ type, k, children, className = "" }) {
  const id = useId(), { tip, anchor, fit } = useTip(), def = (TYPES[type]?.defs || []).find(d => d.key === k);
  if (!def) return <>{children}</>;
  return (
    <span className={"mname " + className} onMouseEnter={fit} onFocus={fit}>
      <span ref={anchor} className="mname-t" tabIndex={0} aria-describedby={id}>{children}</span>
      <Bubble id={id} tipRef={tip} def={def} type={type} />
    </span>
  );
}
