import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },
  },
  {
    files: ["scripts/**"],
    rules: {
      "obsidianmd/hardcoded-config-path": "off",
      "obsidianmd/rule-custom-message": "off",
    },
  },
  {
    ignores: ["main.js", "node_modules/**"],
  },
]);
