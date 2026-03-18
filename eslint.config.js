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

      // Signal 6 — Large file detection (AGENTS.md: 200-line file limit)
      "max-lines": ["warn", { max: 200, skipBlankLines: true, skipComments: true }],

      // Signal 6b — Large function detection (AGENTS.md: 50-line function limit)
      "max-lines-per-function": ["warn", { max: 50, skipBlankLines: true, skipComments: true }],

      // Signal 7 — Dead code (lint-level)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // Signal 9 — Tech debt tracking
      "no-warning-comments": [
        "warn",
        { terms: ["todo", "fixme", "hack", "xxx"], location: "start" },
      ],
    },
  },
  {
    ignores: ["dist/", "node_modules/", "coverage/", "*.js", "*.mjs", "tests/fixtures/", "vitest.*.ts", "knip.config.ts"],
  },
);
