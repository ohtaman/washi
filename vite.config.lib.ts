import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist/lib",
    emptyOutDir: false,
    lib: {
      entry: {
        "opt-ts": resolve(import.meta.dirname, "src/index.ts"),
        "solvers/z3": resolve(import.meta.dirname, "src/modeler/solvers/z3.ts"),
        "solvers/glpk": resolve(import.meta.dirname, "src/modeler/solvers/glpk.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
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
