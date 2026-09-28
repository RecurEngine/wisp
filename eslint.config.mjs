import tsParser from "@typescript-eslint/parser";
import tsRules from "@typescript-eslint/eslint-plugin";
import obsidian from "eslint-plugin-obsidianmd";

// Reproduce the review categories addressed here on production sources.
export default [{
  files: ["src/**/*.ts"],
  languageOptions: { parser: tsParser, parserOptions: { projectService: true } },
  plugins: { obsidianmd: obsidian, "@typescript-eslint": tsRules },
  linterOptions: { noInlineConfig: true },
  rules: {
    "obsidianmd/no-static-styles-assignment": "error",
    "obsidianmd/prefer-create-el": "error",
    "obsidianmd/settings-tab/prefer-setting-definitions": "error",
    "@typescript-eslint/prefer-promise-reject-errors": "error",
    "@typescript-eslint/no-unnecessary-type-assertion": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "no-restricted-properties": ["error", { object: "document", property: "execCommand", message: "Use the Clipboard API." }],
    "no-restricted-globals": ["error", { name: "fetch", message: "Use Obsidian requestUrl for HTTP requests." }]
  }
}];
