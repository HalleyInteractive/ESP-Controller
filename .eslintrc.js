// This is the ESLint configuration file (legacy format).
module.exports = {
  // Specifies the environments the code runs in (e.g., browser, Node.js).
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  // Extends base configurations: ESLint's recommended rules and TypeScript's recommended rules.
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  // Specifies the parser to use for TypeScript code.
  parser: '@typescript-eslint/parser',
  // Configuration options for the parser.
  parserOptions: {
    ecmaVersion: 12, // Allows for the parsing of modern ECMAScript features.
    sourceType: 'module', // Allows for the use of imports.
  },
  // Lists ESLint plugins used (e.g., for TypeScript-specific linting rules).
  plugins: [
    '@typescript-eslint/eslint-plugin',
  ],
  // Section for custom rule configurations or overrides.
  rules: {
  },
};
