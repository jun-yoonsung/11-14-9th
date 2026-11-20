import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);
  const timer = useRef();
  const toast = useCallback(m => {
    setMsg(m); setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 3200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div id="toast" role="status" className={show ? "show" : ""}>{msg}</div>
    </Ctx.Provider>
  );
}
