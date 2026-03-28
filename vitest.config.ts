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
        // Route handlers / auth flows — require integration tests, not unit tests
        "src/audit/api.ts",
        "src/prompt/api.ts",
        "src/http/write-audit.ts",
        "src/cli/services.ts",
        "src/cli/runtime-providers.ts",
        "src/setup/device-auth.ts",
        "src/setup/handlers/pkce-auth.ts",
        // Dispatch server — integration-level coverage
        "src/dispatch/server.ts",
        // Network-dependent model listing
        "src/codex/model-list.ts",
        // Schema definitions — no branching logic to unit-test
        "src/persistence/sqlite/schema.ts",
      ],
      thresholds: {
        // Per-file mode: every source file must meet these minimums individually.
        // Vitest 4 applies perFile globally — there is no separate aggregate gate.
        // Aggregate coverage is well above these floors (82/73/82/82+), so this
        // catches under-tested files without regressing the overall bar.
        statements: 50,
        branches: 40,
        functions: 50,
        lines: 50,
        perFile: true,
      },
    },
  },
});
