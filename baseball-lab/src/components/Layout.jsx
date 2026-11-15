import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useSceneName } from "../context/SceneContext.jsx";
import Scene from "./Scene.jsx";
import BallIcon from "./BallIcon.jsx";

export default function Layout() {
  const { loggedIn, name, logout } = useAuth();
  const scene = useSceneName();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // 배경 장면 위에 내용이 올라오는 레이아웃은 body 클래스로 켠다 (index.css의 .has-scene 규칙)
  useEffect(() => { document.body.classList.add("has-scene"); return () => document.body.classList.remove("has-scene", "home"); }, []);
  useEffect(() => { document.body.dataset.scene = scene; }, [scene]);
  useEffect(() => { document.body.classList.toggle("home", pathname === "/"); window.scrollTo(0, 0); }, [pathname]);

  const tab = ({ isActive }) => (isActive ? "active" : undefined);
  return (
    <>
      <Scene />
      <header className="site-head">
        <div className="wrap head-in">
          <Link className="logo" to="/"><BallIcon className="ball" /><span>야구 분석 랩</span></Link>
          <nav className="tabs" aria-label="주 메뉴">
            <NavLink to="/rank" className={tab}>선수 순위</NavLink>
            <NavLink to="/guide" className={tab}>지표 설명</NavLink>
            <NavLink to="/analyze" className={tab}>데이터 분석</NavLink>
            <NavLink to="/history" className={tab}>분석 기록</NavLink>
          </nav>
          <div className="who">
            {loggedIn
              ? <><span className="name">{name}</span><button className="linkbtn" type="button" onClick={() => { logout(); navigate("/"); }}>로그아웃</button></>
              : <Link className="linkbtn" to="/login">로그인</Link>}
          </div>
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="foot">
        <div className="wrap">화면의 선수와 팀 기록은 KBO 2026 정규시즌 경기 기록을 집계한 값입니다. 분석 기록은 체험 로그인이면 이 브라우저에, 실제 계정이면 내 계정에 저장됩니다.</div>
      </footer>
    </>
  );
}
