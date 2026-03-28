import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/**/*.integration.test.ts", "tests/http/load.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/dashboard/template.ts",
        // Type-only files with no executable code
        "src/orchestrator/context.ts",
        "src/orchestrator/runtime-types.ts",
        "src/dispatch/types.ts",
        "src/core/types.ts",
        // CLI entrypoint (requires integration test)
        "src/dispatch/entrypoint.ts",
        "src/cli/index.ts",
        // Frontend — needs browser testing, not Node unit tests
        "frontend/src/**",
        // Route handlers / auth flows — require integration tests
        "src/audit/api.ts",
        "src/prompt/api.ts",
        "src/cli/runtime-providers.ts",
        "src/setup/device-auth.ts",
        // Dispatch server — integration-level coverage
        "src/dispatch/server.ts",
      ],
      thresholds: {
        statements: 82,
        branches: 73,
        functions: 82,
        lines: 82,
      },
    },
  },
});
