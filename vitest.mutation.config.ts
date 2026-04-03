import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.integration.test.ts", "tests/integration/**/*.test.ts"],
    exclude: [
      "tests/integration/live/**",
      "tests/http/load.test.ts",
      "tests/agent-runner/agent-runner.test.ts",
      "tests/config/legacy-import.integration.test.ts",
    ],
    environment: "node",
    setupFiles: ["tests/helpers/quarantine.ts"],
    retry: 2,
  },
});
