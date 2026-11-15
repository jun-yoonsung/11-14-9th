/* 회원가입: Firebase가 켜져 있으면 실제 가입, 꺼져 있으면 안내만 보인다 */
(function () {
  BL.renderShell("");
  const form = document.getElementById("signupForm");
  if (!BL.Cloud || !BL.Cloud.enabled) {
    form.addEventListener("submit", e => { e.preventDefault(); document.getElementById("notice").classList.remove("hidden"); BL.toast("회원가입은 다음 버전에서 제공됩니다."); });
    return;
  }
  document.querySelector(".card-center h1").textContent = "회원가입";
  document.querySelector(".card-center .sub").textContent = "가입하면 분석 기록이 내 계정에 저장돼 다른 기기에서도 볼 수 있어요.";
  document.querySelector(".card-center > a.btn").outerHTML = `<p class="sub">이미 계정이 있나요? <a class="linkbtn" href="login.html${location.search}">로그인</a></p>`;
  document.getElementById("pw").placeholder = "6자 이상";
  const note = document.getElementById("notice"); note.setAttribute("role", "alert");
  const say = m => { note.textContent = m; note.classList.toggle("hidden", !m); };
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const em = document.getElementById("email").value.trim(), nick = document.getElementById("nick").value.trim(), pw = document.getElementById("pw").value;
    if (!/^\S+@\S+\.\S+$/.test(em)) return say("이메일 형식이 맞지 않습니다.");
    if (nick.length < 2 || nick.length > 12) return say("닉네임은 2~12자로 입력해 주세요.");
    if (pw.length < 6) return say("비밀번호는 6자 이상이어야 합니다.");
    say("");
    try { await BL.Cloud.signUp(em, pw, nick); location.href = BL.Auth.nextUrl(); } catch (er) { say(BL.Cloud.msg(er)); }
  });
})();
