// node_modules의 MediaPipe wasm 파일을 public/wasm/으로 복사한다 (predev·prebuild에서 실행).
import { cpSync, existsSync, mkdirSync } from "node:fs";
const from = new URL("../node_modules/@mediapipe/tasks-vision/wasm/", import.meta.url), to = new URL("../public/wasm/", import.meta.url);
if (!existsSync(from)) { console.warn("MediaPipe가 설치되지 않아 wasm 복사를 건너뜁니다 (npm install 필요)"); process.exit(0); }
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log("MediaPipe wasm 복사 완료");
