import { resolve } from "node:path";

import { defineConfig } from "vite";

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
    proxy: {
      "/api": "http://localhost:4000",
      "/metrics": "http://localhost:4000",
    },
  },
});
