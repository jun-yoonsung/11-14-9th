import { useEffect, useState } from "react";
import { Api } from "../lib/api.js";
import { metricNote } from "../lib/format.js";

/** 미리 만들어 둔 AI 해설(public/data/commentary.json)을 보여 준다. 해설이 없는 선수는 아무것도 그리지 않는다. */
export default function AiCommentary({ rec }) {
  const [c, setC] = useState(null);
  useEffect(() => {
    let live = true;
    Api.commentary().then(all => { if (live) setC(all[`${rec.season}-${rec.params.target}`] || null); }).catch(() => {});
    return () => { live = false; };
  }, [rec]);
  const lines = rec.result.lines || [];
  if (!c && !lines.length) return null;
  return (
    <section className="sec ai-box" aria-label="AI 해설">
      <h2>{c ? "AI 해설" : "고른 지표 해설"}</h2>
      {c && <>
        <p className="ai-lead">{c.summary}</p>
        {c.style && <p className="sub">{c.style}</p>}
        <div className="ai-cols">
          {c.strengths?.length > 0 && <div><h3>눈에 띄는 점</h3><ul className="plain">{c.strengths.map(t => <li key={t}>{t}</li>)}</ul></div>}
          {c.watch?.length > 0 && <div><h3>보완하거나 주의할 점</h3><ul className="plain">{c.watch.map(t => <li key={t}>{t}</li>)}</ul></div>}
        </div>
        {c.similar && <p className="sub">{c.similar}</p>}
      </>}
      {lines.length > 0 && <>
        {c && <h3 style={{ marginTop: 16 }}>고른 지표 해설</h3>}
        <ul className="plain met-notes">{lines.map(l => <li key={l.key}><b>{l.label}</b>{c?.metrics?.[l.label] || metricNote(l)}</li>)}</ul>
      </>}
      <p className="note">{c ? "AI가 이 사이트가 계산한 수치만 바탕으로 미리 작성한 설명입니다. 숫자는 코드가 계산값과 대조해 확인했지만, 해석은 참고용으로 봐 주세요." : "이 선수는 AI 해설이 없어 계산값으로 만든 문장을 보여 줍니다."}{c && " 지표 해설 중 AI 문장이 없는 지표는 계산값으로 만든 문장입니다."}</p>
    </section>
  );
}
