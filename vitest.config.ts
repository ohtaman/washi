import { defineConfig } from "vitest/config";

export default defineConfig({
  root: ".",
  test: {
    globals: true,
    environment: "node",
  },
});
