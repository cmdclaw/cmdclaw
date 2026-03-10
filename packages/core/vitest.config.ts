import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    environment: "node",
    setupFiles: ["src/test/vitest.setup.ts"],
  },
});
