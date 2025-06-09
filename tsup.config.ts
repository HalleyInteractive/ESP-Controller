import { defineConfig } from "tsup";

// This file configures tsup for bundling the TypeScript library.
export default defineConfig({
  // Main entry point(s) for the library.
  entry: ["src/index.ts"],
  // Output formats: CommonJS and ESModule.
  format: ["cjs", "esm"],
  // Generate TypeScript declaration files (.d.ts).
  dts: true,
  // Disable code splitting to produce a single output file per format.
  splitting: false,
  // Generate sourcemaps for easier debugging in consuming projects.
  sourcemap: true,
  // Clean the output directory (dist) before each build.
  clean: true,
});
