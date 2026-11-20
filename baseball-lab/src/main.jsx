import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode><HashRouter><App /></HashRouter></StrictMode>
);

// 설치 가능한 웹앱: 서비스 워커 등록 (http 서버나 https에서만 동작)
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && import.meta.env.PROD) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}
