import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import BallIcon from "../components/BallIcon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useScene } from "../context/SceneContext.jsx";
import { cloud, errMsg } from "../lib/cloud.js";

/** 로그인: Firebase가 켜져 있으면 이메일·Google 로그인, 꺼져 있으면 버튼만 누르는 체험 로그인 */
export default function Login() {
  useScene("stadium");
  const { loginDemo, setUser } = useAuth();
  const navigate = useNavigate();
  const next = useLocation().state?.next || "/analyze";
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);

  const run = async fn => {
    setErr(""); setBusy(true);
    try { setUser(await fn()); navigate(next, { replace: true }); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  if (!cloud.enabled) {
    return (
      <div className="wrap"><div className="card-center">
        <BallIcon />
        <h1>체험 로그인으로 시작하세요</h1>
        <p className="sub">첫 버전은 회원가입 없이 이용합니다.<br />버튼을 누르면 바로 분석을 시작할 수 있어요.</p>
        <button className="btn pri" type="button" onClick={() => { loginDemo(); navigate(next, { replace: true }); }}>로그인</button>
        <p className="sub">계정이 필요하신가요? <Link className="linkbtn" to="/signup" state={{ next }}>회원가입</Link></p>
      </div></div>
    );
  }
  return (
    <div className="wrap"><div className="card-center">
      <BallIcon />
      <h1>로그인</h1>
      <p className="sub">이메일 또는 Google 계정으로 로그인하면 분석 기록이 다른 기기에서도 보여요.</p>
      <form className="form-col" noValidate onSubmit={e => {
        e.preventDefault();
        if (!email.trim() || !pw) { setErr("이메일과 비밀번호를 입력해 주세요."); return; }
        run(() => cloud.signIn(email.trim(), pw));
      }}>
        <div><label className="label" htmlFor="email">이메일</label><input className="field" id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div><label className="label" htmlFor="pw">비밀번호</label><input className="field" id="pw" type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} /></div>
        {err && <div className="err-msg" role="alert">{err}</div>}
        <button className="btn pri" type="submit" disabled={busy}>로그인</button>
      </form>
      <button className="btn" type="button" disabled={busy} onClick={() => run(() => cloud.google())}>Google 계정으로 로그인</button>
      <p className="sub">계정이 없나요? <Link className="linkbtn" to="/signup" state={{ next }}>회원가입</Link></p>
    </div></div>
  );
}
