import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

// This is the ESLint configuration file using the new flat config format.
export default tseslint.config(
  // Base ESLint recommended rules.
  eslint.configs.recommended,
  // TypeScript ESLint recommended rules.
  ...tseslint.configs.recommended,
  // Configuration for Prettier plugin integration.
  {
    plugins: {
      // Integrates Prettier as an ESLint plugin for formatting.
      prettier,
    },
    rules: {
      // Applies Prettier's recommended rules.
      ...prettierConfig.rules,
      // Reports Prettier formatting issues as ESLint errors.
      "prettier/prettier": "error",
    },
  }
);
