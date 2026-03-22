import eslint from "@eslint/js";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Signal 4 — Naming consistency: camelCase vars, PascalCase types
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "variableLike",
          format: ["camelCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
        },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "enumMember", format: ["PascalCase", "UPPER_CASE"] },
      ],

      // Signal 5 — Cyclomatic complexity cap (AGENTS.md: keep functions focused)
      complexity: ["error", { max: 15 }],

      // Signal 6 — Large file detection
      "max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],

      // Signal 6b — Large function detection
      "max-lines-per-function": ["warn", { max: 150, skipBlankLines: true, skipComments: true }],

      // Signal 7 — Dead code (lint-level)
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],

      // Signal 9 — Tech debt tracking
      "no-warning-comments": ["warn", { terms: ["todo", "fixme", "hack", "xxx"], location: "start" }],

      // ── SonarJS rule tuning ──
      // Keep valuable rules at "error" (inherited from recommended):
      //   sonarjs/slow-regex, sonarjs/function-return-type, sonarjs/no-nested-template-literals
      //
      // Disable noisy / false-positive-heavy rules:
      "sonarjs/publicly-writable-directories": "off", // /tmp usage in tests + docker is expected
      "sonarjs/no-clear-text-protocols": "off", // http:// in test URLs + local server config
      "sonarjs/different-types-comparison": "off", // intentional defensive checks against unknown
      "sonarjs/no-os-command-from-path": "off", // PATH inheritance in spawn is by design
      "sonarjs/no-alphabetical-sort": "off", // .sort() on known-safe ASCII strings is fine
      "sonarjs/no-nested-functions": "off", // common pattern in Express handlers and test setup
      "sonarjs/no-nested-conditional": "off", // conflicts with project's early-return style
      "sonarjs/todo-tag": "off", // already covered by no-warning-comments
      "sonarjs/no-undefined-argument": "off", // explicit undefined args in tests are intentional
      "sonarjs/prefer-regexp-exec": "off", // stylistic — match() is fine
      "sonarjs/no-unused-vars": "off", // already covered by @typescript-eslint/no-unused-vars
      "sonarjs/no-invariant-returns": "off", // false positives on guard clauses
    },
  },
  {
    files: ["frontend/**/*.ts"],
    rules: {
      complexity: ["warn", { max: 30 }],
      "max-lines-per-function": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines": ["warn", { max: 600, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Test files are naturally longer (setup + teardown + assertions in describe blocks)
    files: ["tests/**/*.ts"],
    rules: {
      "max-lines": ["warn", { max: 600, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    ignores: [
      "dist/",
      "node_modules/",
      "coverage/",
      "*.js",
      "*.mjs",
      "tests/fixtures/",
      "vitest.*.ts",
      "knip.config.ts",
    ],
  },
);
