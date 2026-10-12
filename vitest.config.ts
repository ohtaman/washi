import { defineConfig } from "vitest/config";

export default defineConfig({
  root: ".",
  test: {
    globals: true,
    environment: "node",
    exclude: process.env.RUN_E2E
      ? ["**/node_modules/**", "**/dist/**", "**/.worktree*/**"]
      : ["**/node_modules/**", "**/dist/**", "**/.worktree*/**", "**/test/e2e.test.ts"],
  },
});
