import { defineConfig } from "vite";

export default defineConfig({
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
    target: "esnext",
  },
});
