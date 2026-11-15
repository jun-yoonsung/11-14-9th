import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useScene } from "../context/SceneContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { cloud, errMsg } from "../lib/cloud.js";

/** 회원가입: Firebase가 켜져 있으면 실제 가입, 꺼져 있으면 안내만 보인다 */
export default function Signup() {
  useScene("stadium");
  const { setUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const next = useLocation().state?.next || "/analyze";
  const on = cloud.enabled;
  const [f, setF] = useState({ email: "", nick: "", pw: "" });
  const [msg, setMsg] = useState("");
  const set = k => e => setF({ ...f, [k]: e.target.value });

  const submit = async e => {
    e.preventDefault();
    if (!on) { setMsg("회원가입은 다음 버전에서 제공됩니다. 지금은 체험 로그인으로 시작해 주세요."); toast("회원가입은 다음 버전에서 제공됩니다."); return; }
    const em = f.email.trim(), nick = f.nick.trim();
    if (!/^\S+@\S+\.\S+$/.test(em)) return setMsg("이메일 형식이 맞지 않습니다.");
    if (nick.length < 2 || nick.length > 12) return setMsg("닉네임은 2~12자로 입력해 주세요.");
    if (f.pw.length < 6) return setMsg("비밀번호는 6자 이상이어야 합니다.");
    setMsg("");
    try { setUser(await cloud.signUp(em, f.pw, nick)); navigate(next, { replace: true }); } catch (er) { setMsg(errMsg(er)); }
  };

  return (
    <div className="wrap"><div className="card-center">
      <h1>회원가입 {!on && <span className="pill blue">다음 버전</span>}</h1>
      <p className="sub">{on ? "가입하면 분석 기록이 내 계정에 저장돼 다른 기기에서도 볼 수 있어요." : "지금은 체험 로그인으로 모든 기능을 써 볼 수 있어요."}</p>
      <form className="form-col" noValidate onSubmit={submit}>
        <div><label className="label" htmlFor="email">이메일</label><input className="field" id="email" type="email" placeholder="name@example.com" autoComplete="off" value={f.email} onChange={set("email")} /></div>
        <div><label className="label" htmlFor="nick">닉네임</label><input className="field" id="nick" type="text" placeholder="2~12자" autoComplete="off" value={f.nick} onChange={set("nick")} /></div>
        <div><label className="label" htmlFor="pw">비밀번호</label><input className="field" id="pw" type="password" placeholder={on ? "6자 이상" : "8자 이상"} autoComplete="off" value={f.pw} onChange={set("pw")} /></div>
        <button className="btn pri block" type="submit">회원가입</button>
      </form>
      {msg && <div className="notice" role="alert">{msg}</div>}
      {on ? <p className="sub">이미 계정이 있나요? <Link className="linkbtn" to="/login" state={{ next }}>로그인</Link></p> : <Link className="btn" to="/login">체험 로그인으로 시작</Link>}
    </div></div>
  );
}
