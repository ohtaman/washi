import { defineConfig } from "vite";

export default defineConfig({
  root: "examples/web-demo",
  publicDir: "../../public",
  server: {
    port: 5173,
    headers: {
      // Cross-origin isolation headers if needed
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["highs"],
  },
  build: {
    outDir: "../../dist/demo",
    emptyOutDir: true,
    target: "esnext",
  },
});
