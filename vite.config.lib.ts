import { defineConfig } from "vite";
import { resolve } from "path";
import { packageAssets } from "./build/distribution.js";

export default defineConfig({
  publicDir: false,
  plugins: [packageAssets()],
  build: {
    outDir: "dist/lib",
    emptyOutDir: true,
    lib: {
      entry: {
        "washi": resolve(import.meta.dirname, "src/index.ts"),
        "highs-worker": resolve(import.meta.dirname, "src/modeler/solvers/highs/worker.ts"),
        "solvers/z3": resolve(import.meta.dirname, "src/modeler/solvers/z3/index.ts"),
        "solvers/glpk": resolve(import.meta.dirname, "src/modeler/solvers/glpk/index.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      output: { chunkFileNames: "[name]-[hash].js" },
      external: [
        "highs",
        "glpk.js",
        "glpk.js/node",
        "z3-solver",
        "node:fs",
        "node:path",
        "node:url",
        "fs",
        "path",
        "url",
      ],
    },
  },
});
