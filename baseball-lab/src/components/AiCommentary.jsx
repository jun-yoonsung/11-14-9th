import { useEffect, useState } from "react";
import { Api } from "../lib/api.js";

/** 미리 만들어 둔 AI 해설(public/data/commentary.json)을 보여 준다. 해설이 없는 선수는 아무것도 그리지 않는다. */
export default function AiCommentary({ rec }) {
  const [c, setC] = useState(null);
  useEffect(() => {
    let live = true;
    Api.commentary().then(all => { if (live) setC(all[`${rec.season}-${rec.params.target}`] || null); }).catch(() => {});
    return () => { live = false; };
  }, [rec]);
  if (!c) return null;
  return (
    <section className="sec ai-box" aria-label="AI 해설">
      <h2>AI 해설</h2>
      <p className="ai-lead">{c.summary}</p>
      {c.style && <p className="sub">{c.style}</p>}
      <div className="ai-cols">
        {c.strengths?.length > 0 && <div><h3>눈에 띄는 점</h3><ul className="plain">{c.strengths.map(t => <li key={t}>{t}</li>)}</ul></div>}
        {c.watch?.length > 0 && <div><h3>보완하거나 주의할 점</h3><ul className="plain">{c.watch.map(t => <li key={t}>{t}</li>)}</ul></div>}
      </div>
      {c.similar && <p className="sub">{c.similar}</p>}
      <p className="note">AI가 이 사이트가 계산한 수치만 바탕으로 미리 작성한 설명입니다. 숫자는 코드가 계산값과 대조해 확인했지만, 해석은 참고용으로 봐 주세요.</p>
    </section>
  );
}
