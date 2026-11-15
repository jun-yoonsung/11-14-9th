/* 연결 설정: firebase에 값을 채우면 실제 로그인과 DB(Firestore)가 켜집니다. 비워 두면(null) 체험 로그인과 data/ 폴더 CSV를 씁니다.
   Firebase 콘솔 > 프로젝트 설정 > 내 앱 > SDK 설정에 나오는 firebaseConfig 값을 그대로 붙여 넣으세요.
   이 값(apiKey 등)은 비밀 키가 아니라 공개 식별값입니다. 접근 제한은 firestore.rules(보안 규칙)가 합니다. */
window.BL_CONFIG = {
  firebase: null,
  /* 예:
  firebase: { apiKey: "...", authDomain: "...firebaseapp.com", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." },
  */
  dataFromDb: true,   // firebase가 켜져 있으면 CSV를 DB(Firestore)에서 읽고, 실패하면 data/ 폴더 CSV로 돌아갑니다
};
