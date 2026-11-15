import { createContext, useContext, useEffect, useState } from "react";

const Ctx = createContext({ scene: "stadium", setScene: () => {} });
export const SceneProvider = ({ children }) => {
  const [scene, setScene] = useState("stadium");
  return <Ctx.Provider value={{ scene, setScene }}>{children}</Ctx.Provider>;
};
/** 화면이 보일 때 배경 장면을 바꾼다: "stadium" | "batter" | "pitcher" */
export function useScene(name) {
  const { setScene } = useContext(Ctx);
  useEffect(() => { setScene(name); }, [name, setScene]);
}
export const useSceneName = () => useContext(Ctx).scene;
