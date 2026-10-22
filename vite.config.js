import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Z.ai's API sends no CORS headers on preflight requests, so the browser
// cannot call it directly. The dev and preview servers forward /zai/* to it,
// and /gemini/* to Google's Gemini API the same way.
const proxy = {
  "/zai": {
    target: "https://api.z.ai",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/zai/, ""),
  },
  "/gemini": {
    target: "https://generativelanguage.googleapis.com",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/gemini/, ""),
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy,
  },
  preview: {
    proxy,
  },
});
