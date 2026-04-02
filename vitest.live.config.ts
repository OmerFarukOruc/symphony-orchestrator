import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/live/**/*.integration.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
