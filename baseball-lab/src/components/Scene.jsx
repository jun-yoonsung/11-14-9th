import { memo, useEffect, useState } from "react";
import { SCENES } from "../lib/sceneSvg.js";
import { useSceneName } from "../context/SceneContext.jsx";

// SVG 그림은 바뀌지 않는 정적 마크업이라 다시 그리지 않도록 memo로 감싼다
const Layer = memo(function Layer({ name, on }) {
  return <div className={"sc sc-" + name + (on ? " on" : "")} dangerouslySetInnerHTML={{ __html: SCENES[name] }} />;
});

/** 움직이는 야구장 배경. 처음 보일 때 한 번만 그리고, 보이지 않는 장면의 애니메이션은 만들지 않는다 */
export default function Scene() {
  const scene = useSceneName();
  const [seen, setSeen] = useState(() => new Set(["stadium"]));
  useEffect(() => { setSeen(s => (s.has(scene) ? s : new Set(s).add(scene))); }, [scene]);
  return (
    <div className="scene" aria-hidden="true">
      {Object.keys(SCENES).map(n => (seen.has(n) ? <Layer key={n} name={n} on={n === scene} /> : null))}
    </div>
  );
}
