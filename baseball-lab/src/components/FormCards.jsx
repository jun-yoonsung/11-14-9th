/** 조정 방향 카드: 처방이 아니라 참조와 다른 정도를 보고 방향만 가리킨다 */
export default function FormCards({ cards, message, conf }) {
  return (
    <section className="sec" aria-labelledby="fc-h">
      <h2 id="fc-h">조정 방향 카드</h2>
      {conf === "낮음" && <p className="note warn">이 영상은 3D 추정의 신뢰도가 낮아 카드를 만들지 않았어요. 사람 전체가 잘 보이고 정지된 카메라로 찍은 영상을 사용해 보세요.</p>}
      {!cards.length && <div className="insight">{message || "만들어진 카드가 없어요."}</div>}
      <ul className="fcards">
        {cards.map(c => (
          <li key={c.key + c.source} className="fcard">
            <header><b>{c.title}</b><span className={"pill " + (c.source === "kbo" ? "" : "blue")}>{c.source === "kbo" ? "KBO 참조" : "모션캡처 참조"}</span></header>
            <p className="fc-mine">{c.mine}</p>
            <p className="fc-target">{c.target}</p>
            <p className="fc-dir">{c.direction}</p>
            <p className="note">{c.evidence}</p>
            <p className="note">참조 출처: {c.sourceLabel}. 이 지표의 영상 신뢰도: {c.confidence}.</p>
            <p className="note">{c.caution}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
