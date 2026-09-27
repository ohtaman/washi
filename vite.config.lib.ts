import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist/lib",
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      name: "OptTs",
      fileName: () => "opt-ts.js",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["highs", "node:fs", "node:path", "node:url", "fs", "path", "url"],
    },
  },
});
