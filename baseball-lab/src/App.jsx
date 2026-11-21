import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { SceneProvider } from "./context/SceneContext.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import Layout from "./components/Layout.jsx";
import Protected from "./components/Protected.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Analyze from "./pages/Analyze.jsx";
import Result from "./pages/Result.jsx";
import ResultDetail from "./pages/ResultDetail.jsx";
import History from "./pages/History.jsx";
import Records from "./pages/Records.jsx";
import Compare from "./pages/Compare.jsx";
import Rank from "./pages/Rank.jsx";
import Guide from "./pages/Guide.jsx";

export default function App() {
  return (
    <ToastProvider><AuthProvider><SceneProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Signup />} />
          <Route path="rank" element={<Rank />} />
          <Route path="records" element={<Records />} />
          <Route path="compare" element={<Compare />} />
          <Route path="guide" element={<Guide />} />
          <Route path="analyze" element={<Protected><Analyze /></Protected>} />
          <Route path="result/:id" element={<Protected><Result /></Protected>} />
          <Route path="result/:id/detail" element={<Protected><ResultDetail /></Protected>} />
          <Route path="s/:id" element={<Result shared />} />
          <Route path="s/:id/detail" element={<ResultDetail shared />} />
          <Route path="history" element={<Protected><History /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SceneProvider></AuthProvider></ToastProvider>
  );
}
