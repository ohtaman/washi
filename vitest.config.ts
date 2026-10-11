import { defineConfig } from "vitest/config";

export default defineConfig({
  root: ".",
  test: {
    globals: true,
    environment: "node",
    exclude: process.env.RUN_E2E
      ? ["**/node_modules/**", "**/dist/**"]
      : ["**/node_modules/**", "**/dist/**", "test/e2e.test.ts"],
  },
});
