import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/** 로그인해야 볼 수 있는 화면: 로그인 전이면 로그인 화면으로 보내고, 로그인 뒤 원래 화면으로 돌려보낸다 */
export default function Protected({ children }) {
  const { loggedIn } = useAuth();
  const loc = useLocation();
  if (!loggedIn) return <Navigate to="/login" replace state={{ next: loc.pathname + loc.search }} />;
  return children;
}
