import { lazy, memo, Suspense, useEffect, useState } from "react";
import { SCENES } from "../lib/sceneSvg.js";
import { useSceneName } from "../context/SceneContext.jsx";

// SVG 그림은 바뀌지 않는 정적 마크업이라 다시 그리지 않도록 memo로 감싼다
const Stadium3D = lazy(() => import("./Stadium3D.jsx"));

const Layer = memo(function Layer({ name, on }) {
  return <div className={"sc sc-" + name + (on ? " on" : "")} dangerouslySetInnerHTML={{ __html: SCENES[name] }} />;
});

/** 움직이는 야구장 배경. WebGL을 쓸 수 있으면 3D 장면 하나가 화면에 따라 카메라·선수를 바꾸고, 아니면 SVG 장면으로 대신한다 */
export default function Scene() {
  const scene = useSceneName();
  const [fail, setFail] = useState(false);
  const [seen, setSeen] = useState(() => new Set(["stadium"]));
  useEffect(() => { setSeen(s => (s.has(scene) ? s : new Set(s).add(scene))); }, [scene]);
  if (!fail) {
    return (
      <div className="scene" aria-hidden="true">
        <Suspense fallback={null}><Stadium3D mode={scene} onFail={() => setFail(true)} /></Suspense>
      </div>
    );
  }
  return (
    <div className="scene" aria-hidden="true">
      {Object.keys(SCENES).map(n => (seen.has(n) ? <Layer key={n} name={n} on={n === scene} /> : null))}
    </div>
  );
}
