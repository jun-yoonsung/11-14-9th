import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Api } from "../lib/api.js";
import { analyzePlayer } from "../lib/stats.js";
import PctBlock from "../components/PctBlock.jsx";
import { useScene } from "../context/SceneContext.jsx";

const LINEUP = [
  { to: "/analyze?type=batter", pos: "타", cls: "bat", nm: "타자 분석", ds: "타율, OPS, 홈런 같은 타격 지표를 리그와 비교합니다.", go: "분석하기" },
  { to: "/analyze?type=pitcher", pos: "투", cls: "pit", nm: "투수 분석", ds: "평균자책점, WHIP, 9이닝당 삼진을 리그와 비교합니다.", go: "분석하기" },
  { to: "/video", pos: "영", cls: "vid", nm: "영상 분석 (투구 폼·타격 자세)", ds: "투구·스윙 영상에서 관절을 3D로 추정해 몸 쓰는 방식과 조정해 볼 방향을 봅니다.", go: "영상 올리기" },
  { to: "/analyze?type=team", pos: "팀", cls: "team", nm: "팀 비교", ds: "2~4개 팀의 승률과 득점, 실점을 나란히 봅니다.", go: "비교하기" },
];

export default function Home() {
  useScene("stadium");
  const [preview, setPreview] = useState(undefined);   // undefined: 불러오는 중, null: 실패

  // 예시 결과 한 장: 규정타석을 채운 타자 중 OPS 1위
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const meta = await Api.meta(), q = meta.qualify, season = meta.seasons[0];
        const rows = await Api.batters(season);
        const ops = s => (s.h + s.bb + s.hbp) / (s.ab + s.bb + s.hbp + s.sf) + (s.h + s.d2 + 2 * s.d3 + 3 * s.hr) / s.ab;
        const star = rows.filter(s => s.pa >= q.batterPa).sort((a, b) => ops(b) - ops(a))[0];
        const r = analyzePlayer("batter", rows, star.pid, ["AVG", "OPS", "HR"], q);
        if (!dead) setPreview({ title: `${r.subject.name} ${season} 타자 분석`, lines: r.lines });
      } catch (e) { if (!dead) setPreview(null); }
    })();
    return () => { dead = true; };
  }, []);

  return (
    <>
      <div className="wrap hero-wrap">
        <section className="hero">
          <h1>보고 싶은 지표만 고르면<br />계산과 정리는 사이트가 합니다</h1>
          <div className="hero-side">
            <p className="lede">선수와 팀의 기록으로 리그 안에서의 위치를 보여 주고, 결과를 보고서 PDF로 저장해 드려요.</p>
            <div className="cta"><Link className="btn pri lg" to="/analyze">분석 시작하기</Link></div>
          </div>
        </section>
      </div>
      <div className="wrap">
        {preview !== null && (
          <section className="board" aria-live="polite">
            <div className="board-top"><h2>{preview ? preview.title : "예시 결과를 불러오는 중"}</h2><span className="pill">예시</span></div>
            {preview && <PctBlock lines={preview.lines} />}
            <p className="sample-note" style={{ marginTop: 18 }}>구슬 안 숫자가 클수록 리그에서 좋은 기록입니다. 선수와 기록은 KBO 2026 정규시즌 실제 기록이에요.</p>
          </section>
        )}
        <section className="lineup">
          <h2>어떤 분석을 할 수 있나요</h2>
          <ul className="lineup-list">
            {LINEUP.map(x => (
              <li key={x.to}><Link to={x.to}><span className={"pos " + x.cls}>{x.pos}</span><span className="nm">{x.nm}</span><span className="ds">{x.ds}</span><span className="go">{x.go}</span></Link></li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
