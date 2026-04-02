import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.integration.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["tests/integration/live/**"],
    environment: "node",
    setupFiles: ["tests/helpers/quarantine.ts"],
    retry: 2,
  },
});
