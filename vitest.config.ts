import { defineConfig } from "vitest/config";

// This file configures the Vitest test runner.
export default defineConfig({
  test: {
    // Enables global test APIs (describe, it, etc.) without importing them.
    globals: true,
    environment: "node",
    coverage: {
      // Use the 'v8' provider for coverage
      provider: "v8",
      // Specify which files to include in the coverage report
      include: ["src/**/*.ts"],
      // Specify which files to exclude from the coverage report
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      // Specify the reporters to use
      reporter: ["text", "json", "html"],
      // Generate a detailed HTML report in the 'coverage' directory
      reportsDirectory: "./coverage",
    },
  },
});
