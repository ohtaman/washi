import { defineConfig } from "vite";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { browserAssets } from "./build/distribution.js";

const require = createRequire(import.meta.url);

export default defineConfig(() => {
  const iife = process.env.WASHI_BROWSER_FORMAT === "iife";
  const runtime = process.env.WASHI_BROWSER_FORMAT === "runtime";
  return {
    publicDir: false,
    plugins: [browserAssets(iife ? "iife" : "es")],
    // The CJS runtime uses locateFile without a bundler-specific WASM import.
    resolve: { alias: [{ find: /^highs$/, replacement: require.resolve("highs") }] },
    define: {
      process: "undefined",
      "globalThis.process": "undefined",
      __filename: "undefined",
      __dirname: "undefined",
    },
    build: {
      outDir: runtime ? "dist/lib" : "dist/browser",
      emptyOutDir: !iife && !runtime,
      target: "es2022",
      lib: {
        entry: runtime ? resolve(import.meta.dirname, "src/highs-browser-runtime.ts") : iife ? resolve(import.meta.dirname, "src/index.ts") : {
          "washi": resolve(import.meta.dirname, "src/index.ts"),
          "highs-worker": resolve(import.meta.dirname, "src/highs-worker.ts"),
        },
        name: "Washi",
        formats: [iife ? "iife" : "es"],
        fileName: (_format, name) => runtime ? "highs-browser-runtime.js" : iife ? "washi.min.js" : `${name}.js`,
      },
      rollupOptions: { output: { chunkFileNames: "[name]-[hash].js" } },
    },
  };
});
