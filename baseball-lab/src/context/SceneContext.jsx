import { createContext, useContext, useState } from "react";

const Ctx = createContext({ scene: "stadium", setScene: () => {} });
export const SceneProvider = ({ children }) => {
  const [scene, setScene] = useState("stadium");
  return <Ctx.Provider value={{ scene, setScene }}>{children}</Ctx.Provider>;
};
/** 배경은 모든 화면에서 메인과 같은 야구장을 쓴다 (화면마다 장면을 바꾸지 않는다). 호출부 호환을 위해 함수는 남겨 둔다 */
export function useScene() {}
export const useSceneName = () => useContext(Ctx).scene;
