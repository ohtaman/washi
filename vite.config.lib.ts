import { defineConfig } from "vite";
import { resolve } from "path";
import { coreLibraryAssets, solverPackageAssets } from "./build/distribution.js";

export default defineConfig(() => {
  const target = process.env.WASHI_LIB_TARGET || "core";
  if (target === "solvers") {
    return {
      publicDir: false,
      plugins: [solverPackageAssets()],
      build: {
        outDir: "dist/lib/solvers",
        emptyOutDir: false,
        lib: {
          entry: {
            "highs": resolve(import.meta.dirname, "src/modeler/solvers/highs/index.ts"),
            "highs-worker": resolve(import.meta.dirname, "src/modeler/solvers/highs/worker.ts"),
            "pumpkin": resolve(import.meta.dirname, "src/modeler/solvers/pumpkin/index.ts"),
            "pumpkin-worker": resolve(import.meta.dirname, "src/modeler/solvers/pumpkin/worker.ts"),
            "z3": resolve(import.meta.dirname, "src/modeler/solvers/z3/index.ts"),
            "glpk": resolve(import.meta.dirname, "src/modeler/solvers/glpk/index.ts"),
          },
          formats: ["es"],
        },
        rollupOptions: {
          output: { chunkFileNames: "[name]-[hash].js" },
          external: [
            "@ohtaman/washi",
            "glpk.js",
            "glpk.js/node",
            "z3-solver",
            "node:fs",
            "node:fs/promises",
            "node:path",
            "node:url",
            "fs",
            "path",
            "url",
          ],
        },
      },
    };
  }

  return {
    publicDir: false,
    plugins: [coreLibraryAssets()],
    build: {
      outDir: "dist/lib",
      emptyOutDir: true,
      lib: {
        entry: {
          "washi": resolve(import.meta.dirname, "src/index.ts"),
        },
        formats: ["es"],
      },
      rollupOptions: {
        output: { chunkFileNames: "[name]-[hash].js" },
        external: [
          "node:fs",
          "node:fs/promises",
          "node:path",
          "node:url",
          "fs",
          "path",
          "url",
        ],
      },
    },
  };
});
