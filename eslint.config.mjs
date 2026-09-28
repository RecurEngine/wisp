import tsParser from "@typescript-eslint/parser";
import obsidian from "eslint-plugin-obsidianmd";

// Reproduce the review categories addressed here on production sources.
export default [{
  files: ["src/**/*.ts"],
  languageOptions: { parser: tsParser, parserOptions: { projectService: true } },
  plugins: { obsidianmd: obsidian },
  rules: {
    "obsidianmd/no-static-styles-assignment": "error",
    "obsidianmd/prefer-create-el": "error",
    "obsidianmd/settings-tab/prefer-setting-definitions": "error",
    "no-restricted-globals": ["error", { name: "fetch", message: "Use Obsidian requestUrl for ordinary HTTP requests. Streaming requires an explicitly documented exception." }]
  }
}];
