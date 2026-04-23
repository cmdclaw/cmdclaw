import { defineConfig } from "vitest/config";

const includeQuarantinedTests = process.env.TEST_INCLUDE_QUARANTINED === "1";
const quarantinedFiles: string[] = [];

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    exclude: includeQuarantinedTests ? [] : quarantinedFiles,
    environment: "node",
    setupFiles: ["src/test/vitest.setup.ts"],
  },
});
