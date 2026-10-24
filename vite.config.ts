import { defineConfig, type Plugin } from "vite";
import { resolve } from "path";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function discoverGameInputs(baseDir: string): Record<string, string> {
  const gamesRoot = resolve(baseDir, "examples/web-demo/games");
  const inputs: Record<string, string> = {};
  if (!existsSync(gamesRoot)) return inputs;

  const hubIndex = resolve(gamesRoot, "index.html");
  if (existsSync(hubIndex)) {
    inputs["games-hub"] = hubIndex;
  }

  for (const entry of readdirSync(gamesRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const gameIndex = resolve(gamesRoot, entry.name, "index.html");
      if (existsSync(gameIndex)) {
        inputs[`game-${entry.name}`] = gameIndex;
      }
    }
  }
  return inputs;
}

function discoverAppInputs(baseDir: string): Record<string, string> {
  const appsRoot = resolve(baseDir, "examples/web-demo/apps");
  const inputs: Record<string, string> = {};
  if (!existsSync(appsRoot)) return inputs;

  const hubIndex = resolve(appsRoot, "index.html");
  if (existsSync(hubIndex)) {
    inputs["apps-hub"] = hubIndex;
  }

  for (const entry of readdirSync(appsRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const appIndex = resolve(appsRoot, entry.name, "index.html");
      if (existsSync(appIndex)) {
        inputs[`app-${entry.name}`] = appIndex;
      }
    }
  }
  return inputs;
}

function z3DemoAssets(): Plugin {
  const z3JsPath = fileURLToPath(new URL("./z3-built.js", import.meta.resolve("z3-solver")));
  const z3WasmPath = fileURLToPath(new URL("./z3-built.wasm", import.meta.resolve("z3-solver")));

  return {
    name: "washi-z3-demo-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const urlPath = req.url.split("?")[0];
        if (urlPath === "/z3-built.js" || urlPath.endsWith("/z3-built.js")) {
          res.setHeader("Content-Type", "application/javascript");
          res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.end(readFileSync(z3JsPath));
          return;
        }
        if (urlPath === "/z3-built.wasm" || urlPath.endsWith("/z3-built.wasm")) {
          res.setHeader("Content-Type", "application/wasm");
          res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.end(readFileSync(z3WasmPath));
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "z3-built.js",
        source: readFileSync(z3JsPath),
      });
      this.emitFile({
        type: "asset",
        fileName: "z3-built.wasm",
        source: readFileSync(z3WasmPath),
      });
    },
  };
}

export default defineConfig({
  base: process.env.BASE_URL || (process.env.GITHUB_ACTIONS ? "/washi/" : "./"),
  root: "examples/web-demo",
  publicDir: "../../public",
  plugins: [z3DemoAssets()],
  server: {
    port: 5173,
    headers: {
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
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "examples/web-demo/index.html"),
        demo: resolve(import.meta.dirname, "examples/web-demo/demo/index.html"),
        ...discoverAppInputs(import.meta.dirname),
        ...discoverGameInputs(import.meta.dirname),
      },
    },
  },
});
