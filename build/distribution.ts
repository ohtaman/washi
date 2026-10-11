import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const wasm = () => readFileSync(fileURLToPath(import.meta.resolve("highs/runtime")));
const license = () => readFileSync(new URL("../public/highs.wasm.LICENSE", import.meta.url));
const z3Js = () => readFileSync(new URL("./z3-built.js", import.meta.resolve("z3-solver")));
const z3Wasm = () => readFileSync(new URL("./z3-built.wasm", import.meta.resolve("z3-solver")));

/** Keep these small modules unbundled so the consumer can discover the asset URLs. */
export function packageAssets(): Plugin {
  return {
    name: "washi-package-assets",
    enforce: "pre",
    resolveId(id) {
      if (["./highs-assets.js", "./highs-worker-factory.js", "./highs-browser-runtime.js", "./highs-node-runtime.js"].includes(id)) {
        return { id, external: true };
      }
      if (id === "./assets.js") return { id: "./highs-assets.js", external: true };
      if (id === "./worker-factory.js") return { id: "./highs-worker-factory.js", external: true };
      if (id === "./node-runtime.js") return { id: "./highs-node-runtime.js", external: true };
      if (id === "./browser-runtime.js") return { id: "./highs-browser-runtime.js", external: true };
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "highs-assets.js", source:
        'export function getBundledWasmUrl() { return new URL("./highs.wasm", import.meta.url).href; }\n' });
      this.emitFile({ type: "asset", fileName: "highs-worker-factory.js", source:
        'export function createHighsWorker() { return new Worker(new URL("./highs-worker.js", import.meta.url), { type: "module" }); }\n' });
      this.emitFile({ type: "asset", fileName: "highs-node-runtime.js", source:
        'export async function loadNodeHighs() { return (await import(/* webpackIgnore: true */ /* @vite-ignore */ "highs")).default; }\n' });
      this.emitFile({ type: "asset", fileName: "highs.wasm", source: wasm() });
      this.emitFile({ type: "asset", fileName: "highs.wasm.LICENSE", source: license() });
      this.emitFile({ type: "asset", fileName: "solvers/z3-built.js", source: z3Js() });
      this.emitFile({ type: "asset", fileName: "solvers/z3-built.wasm", source: z3Wasm() });
    },
  };
}

/** Browser distributions contain all HiGHS JS, but no optional solver engines in core. */
export function browserAssets(format: "es" | "iife", target: "core" | "glpk" | "z3" = "core"): Plugin {
  const assetsId = "\0washi-browser-assets";
  const factoryId = "\0washi-browser-worker-factory";
  const optionalId = "\0washi-optional-engine";
  const nodeId = "\0washi-node-only";
  const base = format === "es"
    ? 'const assetBase = import.meta.url;'
    : 'const scriptUrl = typeof document !== "undefined" ? document.currentScript?.src : null;\n' +
      'const assetBase = scriptUrl ? new URL(".", scriptUrl).href : null;';
  return {
    name: "washi-browser-assets",
    enforce: "pre",
    resolveId(id) {
      if ([assetsId, factoryId, optionalId, nodeId].includes(id)) return id;
      if (id === "./highs-assets.js" || id === "./assets.js" || id.endsWith("/highs/assets.js")) return assetsId;
      if (id === "./highs-worker-factory.js" || id === "./worker-factory.js" || id.endsWith("/highs/worker-factory.js")) return factoryId;
      if (id === "./highs-node-runtime.js" || id === "./node-runtime.js" || id.endsWith("/highs/node-runtime.js")) return "\0washi-node-runtime";
      if (id === "\0washi-node-runtime") return id;

      if (target === "glpk") {
        if (id === "glpk.js/node") return nodeId;
        if (id === "z3-solver") return optionalId;
        if (id.startsWith("node:") || ["fs", "path", "url"].includes(id)) return nodeId;
        return;
      }

      if (target === "z3") {
        if (["glpk.js", "glpk.js/node"].includes(id)) return optionalId;
        if (id.startsWith("node:") || ["fs", "path", "url"].includes(id)) return nodeId;
        return;
      }

      // target === "core"
      if (["glpk.js", "glpk.js/node", "z3-solver"].includes(id)) return optionalId;
      if (id.startsWith("node:") || ["fs", "path", "url"].includes(id)) return nodeId;
    },
    load(id) {
      if (id === assetsId) return `${base}
        export function getAssetUrl(name) {
          if (!assetBase) throw new Error("[WaSHI] Load the browser IIFE using an external script src, or use the browser ESM build.");
          return new URL(name, assetBase).href;
        }
        export function getBundledWasmUrl() { return getAssetUrl("highs.wasm"); }`;
      if (id === factoryId) return `import { getAssetUrl } from ${JSON.stringify(assetsId)};
        export function createHighsWorker() {
          const url = getAssetUrl("highs-worker.js");
          if (new URL(url).origin === window.location.origin) return new Worker(url, { type: "module" });
          const bootstrap = URL.createObjectURL(new Blob(["import " + JSON.stringify(url) + ";"], { type: "text/javascript" }));
          try {
            const worker = new Worker(bootstrap, { type: "module" });
            const release = () => URL.revokeObjectURL(bootstrap);
            worker.addEventListener("message", release, { once: true });
            worker.addEventListener("error", release, { once: true });
            return worker;
          } catch (error) { URL.revokeObjectURL(bootstrap); throw error; }
        }`;
      if (id === optionalId) return `export default function unavailable() { throw new Error("[WaSHI] Optional GLPK/Z3 engines are not included in the core browser bundle. Import the plugin module or include its script tag."); }
        export const init = unavailable;`;
      if (id === nodeId) return "export default {};";
      if (id === "\0washi-node-runtime") return 'export function loadNodeHighs() { throw new Error("This distribution is for browsers. Use the npm entry in Node.js."); }';
    },
    generateBundle() {
      if (target === "core") {
        this.emitFile({ type: "asset", fileName: "highs.wasm", source: wasm() });
        this.emitFile({ type: "asset", fileName: "highs.wasm.LICENSE", source: license() });
        this.emitFile({ type: "asset", fileName: "solvers/z3-built.js", source: z3Js() });
        this.emitFile({ type: "asset", fileName: "solvers/z3-built.wasm", source: z3Wasm() });
      }
    },
  };
}
