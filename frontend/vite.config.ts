import { resolve } from "node:path";

import { defineConfig } from "vite";

// oh-my-anvil adoption: honor ANVIL_FRONTEND_PORT and ANVIL_BACKEND_PORT
// so parallel factory runs don't collide. Falls back to the historical
// defaults (5173 / 4000) when anvil isn't driving the session.
const FRONTEND_PORT = Number(process.env.ANVIL_FRONTEND_PORT ?? 5173);
const BACKEND_PORT = Number(process.env.ANVIL_BACKEND_PORT ?? 4000);
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

export default defineConfig({
  root: "frontend",
  build: {
    outDir: "../dist/frontend",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(process.cwd(), "frontend/index.html"),
    },
  },
  server: {
    port: FRONTEND_PORT,
    proxy: {
      "/api": BACKEND_URL,
      "/metrics": BACKEND_URL,
    },
  },
});
