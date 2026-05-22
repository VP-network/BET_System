// ESLint 9 flat config. Replaces the missing eslint.config.* the lint script
// (`eslint . --max-warnings 0`) needs — without it ESLint 9 just errors out.
import js from "@eslint/js";
import globals from "globals";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  // Lint application code only — build/tooling configs are out of scope.
  { ignores: ["dist/**", "node_modules/**", "*.tsbuildinfo", "*.config.{js,ts}"] },
  js.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // TypeScript's own resolver handles undefined identifiers — `no-undef`
      // only produces false positives on type-level names here.
      "no-undef": "off",
    },
  },
];
