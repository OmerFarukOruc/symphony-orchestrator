import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/**/*.integration.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/dashboard/template.ts"],
      thresholds: {
        statements: 80,
        branches: 72,
        functions: 80,
        lines: 80,
      },
    },
  },
});
