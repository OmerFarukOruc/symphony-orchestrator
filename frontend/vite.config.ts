import { resolve } from "node:path";

import { defineConfig } from "vite";

const frontendRoot = import.meta.dirname;
const repoRoot = resolve(frontendRoot, "..");

export default defineConfig({
  root: frontendRoot,
  build: {
    outDir: resolve(repoRoot, "dist/frontend"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(frontendRoot, "index.html"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:4000",
      "/metrics": "http://localhost:4000",
    },
  },
});
