import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
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

      // Signal 6 — File length gate (AGENTS.md: 300-line extraction decision tree trigger)
      // Warns at 300 lines; type-only files and constants are exempt (review manually).
      "max-lines": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],

      // Signal 6b — Function length gate (AGENTS.md: break long functions into named helpers)
      "max-lines-per-function": ["warn", { max: 50, skipBlankLines: true, skipComments: true }],

      // Signal 7 — Dead code (lint-level)
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],

      // Signal 9 — Tech debt tracking
      "no-warning-comments": ["warn", { terms: ["todo", "fixme", "hack", "xxx"], location: "start" }],
    },
  },
  {
    files: ["frontend/**/*.ts"],
    rules: {
      complexity: ["warn", { max: 30 }],
    },
  },
  {
    // Test files are naturally longer (setup + teardown + assertions in describe blocks)
    files: ["tests/**/*.ts"],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
    },
  },
  {
    // AGENTS.md exemption: "Files containing only type definitions, query strings,
    // or pure constants are exempt from size review."
    files: [
      "src/**/types.ts",
      "src/**/types/**/*.ts",
      "src/**/queries.ts",
      "src/**/constants.ts",
    ],
    rules: {
      "max-lines": "off",
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
