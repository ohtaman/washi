import { defineConfig } from "vite";
import { resolve } from "node:path";
import { browserAssets } from "./build/distribution.js";

export default defineConfig(() => {
  const iife = process.env.WASHI_BROWSER_FORMAT === "iife";
  const runtime = process.env.WASHI_BROWSER_FORMAT === "runtime";
  const target = (process.env.WASHI_BROWSER_TARGET || "core") as "core" | "highs" | "pumpkin" | "glpk" | "z3";

  let entry: any;
  let name = "Washi";
  let fileName: (_format: string, name: string) => string;
  let emptyOutDir = false;
  let outDir = runtime ? "dist/lib/solvers" : "dist/browser";

  if (runtime) {
    entry = resolve(import.meta.dirname, "src/modeler/solvers/highs/browser-runtime.ts");
    name = "Washi";
    fileName = () => "highs-browser-runtime.js";
  } else if (target === "highs") {
    entry = {
      "highs": resolve(import.meta.dirname, "src/modeler/solvers/highs/index.ts"),
      "highs-worker": resolve(import.meta.dirname, "src/modeler/solvers/highs/worker.ts"),
    };
    name = "WashiHiGHS";
    outDir = "dist/browser/solvers";
    fileName = (_format, entryName) => `${entryName}.js`;
  } else if (target === "pumpkin") {
    entry = {
      "pumpkin": resolve(import.meta.dirname, "src/modeler/solvers/pumpkin/index.ts"),
      "pumpkin-worker": resolve(import.meta.dirname, "src/modeler/solvers/pumpkin/worker.ts"),
    };
    name = "WashiPumpkin";
    outDir = "dist/browser/solvers";
    fileName = (_format, entryName) => `${entryName}.js`;
  } else if (target === "glpk") {
    entry = resolve(import.meta.dirname, "src/modeler/solvers/glpk/index.ts");
    name = "WashiGLPK";
    fileName = () => (iife ? "solvers/glpk.min.js" : "solvers/glpk.js");
  } else if (target === "z3") {
    entry = resolve(import.meta.dirname, "src/modeler/solvers/z3/index.ts");
    name = "WashiZ3";
    fileName = () => (iife ? "solvers/z3.min.js" : "solvers/z3.js");
  } else if (iife) {
    entry = resolve(import.meta.dirname, "src/index.ts");
    name = "Washi";
    fileName = () => "washi.min.js";
  } else {
    // core esm
    entry = {
      "washi": resolve(import.meta.dirname, "src/index.ts"),
    };
    name = "Washi";
    emptyOutDir = true;
    fileName = (_format, entryName) => `${entryName}.js`;
  }

  return {
    publicDir: false,
    plugins: [browserAssets(iife ? "iife" : "es", target)],
    define: {
      global: "globalThis",
      process: "undefined",
      "globalThis.process": "undefined",
      __filename: "undefined",
      __dirname: "undefined",
      ...(iife ? { "import.meta": "{}" } : {}),
    },
    build: {
      outDir,
      emptyOutDir,
      target: "es2022",
      lib: {
        entry,
        name,
        formats: [iife ? "iife" : "es"],
        fileName,
      },
      rollupOptions: {
        output:
          target === "glpk" || target === "z3" || iife
            ? { codeSplitting: false }
            : target === "highs" || target === "pumpkin"
              ? { chunkFileNames: `${target}-[name]-[hash].js` }
              : { chunkFileNames: "[name]-[hash].js" },
      },
    },
  };
});
