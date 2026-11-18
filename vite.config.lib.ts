import { defineConfig } from "vite";
import { resolve } from "path";
import { packageAssets, pumpkinPackageAssets } from "./build/distribution.js";

export default defineConfig(() => {
  const isPumpkin = process.env.WASHI_LIB_TARGET === "pumpkin";
  if (isPumpkin) {
    return {
      publicDir: false,
      plugins: [pumpkinPackageAssets()],
      build: {
        outDir: "dist/lib/solvers",
        emptyOutDir: false,
        lib: {
          entry: {
            "pumpkin": resolve(import.meta.dirname, "src/modeler/solvers/pumpkin/index.ts"),
            "pumpkin-worker": resolve(import.meta.dirname, "src/modeler/solvers/pumpkin/worker.ts"),
          },
          formats: ["es"],
        },
        rollupOptions: {
          output: { chunkFileNames: "pumpkin-[name]-[hash].js" },
          external: [
            "@ohtaman/washi",
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
  };
});
