import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: resolve(import.meta.dirname, "."),
  // Strictly disable public directory so that NO highs.wasm is served locally!
  publicDir: false,
  server: {
    port: 5199,
  },
});
