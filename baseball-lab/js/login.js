/* 로그인: Firebase가 켜져 있으면 이메일·Google 로그인, 꺼져 있으면 버튼만 누르는 체험 로그인 */
(function () {
  BL.renderShell("");
  const box = document.querySelector(".card-center");
  const go = () => { location.href = BL.Auth.nextUrl(); };
  if (!BL.Cloud || !BL.Cloud.enabled) {
    document.getElementById("ballSlot").innerHTML = BL.BALL;
    document.getElementById("loginBtn").addEventListener("click", () => { BL.Auth.login(); go(); });
    return;
  }
  box.innerHTML = `${BL.BALL}<h1>로그인</h1><p class="sub">이메일 또는 Google 계정으로 로그인하면 분석 기록이 다른 기기에서도 보여요.</p>
    <form class="form-col" id="loginForm" novalidate>
      <div><label class="label" for="email">이메일</label><input class="field" id="email" type="email" autocomplete="email" /></div>
      <div><label class="label" for="pw">비밀번호</label><input class="field" id="pw" type="password" autocomplete="current-password" /></div>
      <div class="err-msg hidden" id="err" role="alert"></div>
      <button class="btn pri" type="submit" id="goBtn">로그인</button>
    </form>
    <button class="btn" type="button" id="gBtn">Google 계정으로 로그인</button>
    <p class="sub">계정이 없나요? <a class="linkbtn" href="signup.html${location.search}">회원가입</a></p>`;
  const err = m => { const e = document.getElementById("err"); e.textContent = m; e.classList.toggle("hidden", !m); };
  const run = async fn => { err(""); try { await fn(); go(); } catch (e) { err(BL.Cloud.msg(e)); } };
  document.getElementById("loginForm").addEventListener("submit", e => {
    e.preventDefault();
    const em = document.getElementById("email").value.trim(), pw = document.getElementById("pw").value;
    if (!em || !pw) { err("이메일과 비밀번호를 입력해 주세요."); return; }
    run(() => BL.Cloud.signIn(em, pw));
  });
  document.getElementById("gBtn").addEventListener("click", () => run(() => BL.Cloud.google()));
})();
