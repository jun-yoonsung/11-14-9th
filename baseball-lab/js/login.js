/* 체험 로그인: 버튼만 누르면 로그인된다 */
(function () {
  BL.renderShell("");
  document.getElementById("ballSlot").innerHTML = BL.BALL;
  document.getElementById("loginBtn").addEventListener("click", () => {
    BL.Auth.login();
    location.href = BL.Auth.nextUrl();
  });
})();
