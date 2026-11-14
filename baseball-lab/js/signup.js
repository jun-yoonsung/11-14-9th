/* 회원가입은 화면만. 누르면 다음 버전 안내만 보이고 아무것도 저장하지 않는다 */
(function () {
  BL.renderShell("");
  document.getElementById("signupForm").addEventListener("submit", e => {
    e.preventDefault();
    document.getElementById("notice").classList.remove("hidden");
    BL.toast("회원가입은 다음 버전에서 제공됩니다.");
  });
})();
