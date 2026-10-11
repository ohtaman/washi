import { defineConfig } from "vitest/config";

export default defineConfig({
  root: ".",
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "test/e2e.test.ts"],
  },
});
