import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  server: {
    port: 4001,
    proxy: {
      "/api": "http://localhost:4000",
      "/metrics": "http://localhost:4000",
    },
  },
});
