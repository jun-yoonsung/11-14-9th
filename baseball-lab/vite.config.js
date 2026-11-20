import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base "./" : 사이트가 어느 주소 아래에 올라가도(GitHub Pages 하위 경로 등) 파일을 찾도록 상대 경로로 만든다
export default defineConfig({ base: "./", plugins: [react(), tailwindcss()], build: { chunkSizeWarningLimit: 1000 } });
