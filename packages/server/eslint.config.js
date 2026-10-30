import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config({ ignores: ["dist"] }, js.configs.recommended, ...tseslint.configs.recommended, {
  files: ["**/*.ts"],
  languageOptions: {
    ecmaVersion: 2022,
  },
}, {
  // Node scripts (scripts/)
  files: ["**/*.mjs"],
  languageOptions: {
    globals: { console: "readonly", process: "readonly", fetch: "readonly", performance: "readonly", setTimeout: "readonly" },
  },
});
