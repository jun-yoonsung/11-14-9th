import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Auth } from "../lib/storage.js";
import { cloud } from "../lib/cloud.js";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const read = () => ({ loggedIn: Auth.isIn(), name: Auth.name() });
  const [state, setState] = useState(read);
  const refresh = useCallback(() => setState(read()), []);

  // Firebase가 켜져 있으면 로그인 상태 변화(다른 탭에서 로그아웃 등)를 따라간다
  useEffect(() => {
    let off = () => {}, dead = false;
    cloud.watch(user => {
      if (user) Auth.set(user); else Auth.clearCloud();
      refresh();
    }).then(f => { if (dead) f(); else off = f; });
    return () => { dead = true; off(); };
  }, [refresh]);

  const value = useMemo(() => ({
    ...state,
    refresh,
    loginDemo() { Auth.loginDemo(); refresh(); },
    setUser(user) { Auth.set(user); refresh(); },
    logout() { Auth.logout(); refresh(); },
  }), [state, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
