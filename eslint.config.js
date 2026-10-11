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
    // Test fakes stand in for Obsidian objects: no real TFile to narrow with instanceof,
    // and no popout window, so the plugin-code rules don't apply.
    files: ["test-fakes.ts", "*.test.ts"],
    rules: {
      "obsidianmd/no-global-this": "off",
      "obsidianmd/no-tfile-tfolder-cast": "off",
    },
  },
  {
    ignores: ["main.js", "node_modules/**"],
  },
]);
