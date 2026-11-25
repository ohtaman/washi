import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

const wasm = () => readFileSync(new URL("../public/solvers/highs.wasm", import.meta.url));
const license = () => readFileSync(new URL("../public/solvers/highs.wasm.LICENSE", import.meta.url));
const runtimeJs = () => readFileSync(new URL("../src/modeler/solvers/highs/runtime.js", import.meta.url));
const pumpkinWasm = () => readFileSync(new URL("../public/solvers/pumpkin.wasm", import.meta.url));
const pumpkinLicense = () => readFileSync(new URL("../public/solvers/pumpkin.wasm.LICENSE", import.meta.url));
const z3Js = () => readFileSync(new URL("./z3-built.js", import.meta.resolve("z3-solver")));
const z3Wasm = () => readFileSync(new URL("./z3-built.wasm", import.meta.resolve("z3-solver")));

function isSolversIndexImporter(importer?: string): boolean {
  if (!importer) return false;
  const normalized = importer.replaceAll("\\", "/");
  return normalized.endsWith("/src/modeler/solvers/index.ts") || normalized.endsWith("/src/modeler/solvers/index.js");
}

function isImporterInSolver(importer: string | undefined, name: string): boolean {
  if (!importer) return false;
  const normalized = importer.replaceAll("\\", "/");
  return normalized.includes(`/${name}/`) || normalized.endsWith(`/solvers/${name}.ts`) || normalized.endsWith(`/solvers/${name}.js`);
}

/** Externalize bundled solver registrations in dist/lib/washi.js so they share dist/lib/solvers/*.js. */
export function coreLibraryAssets(): Plugin {
  return {
    name: "washi-core-library-assets",
    enforce: "pre",
    resolveId(id, importer) {
      if (isSolversIndexImporter(importer)) {
        if (id === "./highs.js" || id === "./highs/index.js") {
          return { id: "./solvers/highs.js", external: true };
        }
        if (id === "./pumpkin.js" || id === "./pumpkin/index.js") {
          return { id: "./solvers/pumpkin.js", external: true };
        }
      }
    },
  };
}

/** Keep solver asset discovery modules unbundled in dist/lib/solvers so consumers can resolve asset URLs. */
export function solverPackageAssets(): Plugin {
  return {
    name: "washi-solver-package-assets",
    enforce: "pre",
    resolveId(id, importer) {
      if (
        [
          "./highs-assets.js",
          "./highs-worker-factory.js",
          "./highs-browser-runtime.js",
          "./highs-node-runtime.js",
          "./pumpkin-assets.js",
          "./pumpkin-worker-factory.js",
          "./pumpkin-node-runtime.js",
          "./z3-assets.js",
        ].includes(id)
      ) {
        return { id, external: true };
      }
      if (isImporterInSolver(importer, "pumpkin")) {
        if (id === "./assets.js") return { id: "./pumpkin-assets.js", external: true };
        if (id === "./worker-factory.js") return { id: "./pumpkin-worker-factory.js", external: true };
        if (id === "./node-runtime.js") return { id: "./pumpkin-node-runtime.js", external: true };
      }
      if (isImporterInSolver(importer, "z3")) {
        if (id === "./assets.js" || id === "./z3-assets.js") return { id: "./z3-assets.js", external: true };
      }
      if (isImporterInSolver(importer, "highs")) {
        if (id === "./assets.js") return { id: "./highs-assets.js", external: true };
        if (id === "./worker-factory.js") return { id: "./highs-worker-factory.js", external: true };
        if (id === "./node-runtime.js") return { id: "./highs-node-runtime.js", external: true };
        if (id === "./browser-runtime.js") return { id: "./highs-browser-runtime.js", external: true };
      }
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "highs-assets.js",
        source: 'export function getBundledWasmUrl() { return new URL("./highs.wasm", import.meta.url).href; }\n',
      });
      this.emitFile({
        type: "asset",
        fileName: "highs-worker-factory.js",
        source: 'export function createHighsWorker() { return new Worker(new URL("./highs-worker.js", import.meta.url), { type: "module" }); }\n',
      });
      this.emitFile({ type: "asset", fileName: "highs-runtime.js", source: runtimeJs() });
      this.emitFile({
        type: "asset",
        fileName: "highs-node-runtime.js",
        source:
          'export async function loadNodeHighs() {\n' +
          '  const [{ default: createHiGHS }, { Highs }, { existsSync }, { fileURLToPath }] = await Promise.all([\n' +
          '    import(/* webpackIgnore: true */ /* @vite-ignore */ "./highs-runtime.js"),\n' +
          '    import(/* webpackIgnore: true */ /* @vite-ignore */ "./highs.js"),\n' +
          '    import(/* webpackIgnore: true */ /* @vite-ignore */ "node:fs"),\n' +
          '    import(/* webpackIgnore: true */ /* @vite-ignore */ "node:url"),\n' +
          '  ]);\n' +
          '  return async (options = {}) => {\n' +
          '    let wasmPath;\n' +
          '    try {\n' +
          '      const candidate = fileURLToPath(new URL("./highs.wasm", import.meta.url));\n' +
          '      if (existsSync(candidate)) wasmPath = candidate;\n' +
          '    } catch {}\n' +
          '    const locateFile = (file, dir) => options.locateFile ? options.locateFile(file, dir) : (file.endsWith(".wasm") && wasmPath ? wasmPath : (dir || "") + file);\n' +
          '    const instantiateWasm = options.wasmBinary\n' +
          '      ? (imports, successCallback) => {\n' +
          '          WebAssembly.instantiate(options.wasmBinary, imports).then((res) => successCallback("instance" in res ? res.instance : res));\n' +
          '          return {};\n' +
          '        }\n' +
          '      : options.instantiateWasm;\n' +
          '    const module = await createHiGHS({ ...options, locateFile, ...(instantiateWasm ? { instantiateWasm } : {}) });\n' +
          '    return new Highs(module);\n' +
          '  };\n' +
          '}\n',
      });
      this.emitFile({ type: "asset", fileName: "highs.wasm", source: wasm() });
      this.emitFile({ type: "asset", fileName: "highs.wasm.LICENSE", source: license() });

      this.emitFile({
        type: "asset",
        fileName: "pumpkin-assets.js",
        source: 'export function getBundledPumpkinWasmUrl() { return new URL("./pumpkin.wasm", import.meta.url).href; }\n',
      });
      this.emitFile({
        type: "asset",
        fileName: "pumpkin-worker-factory.js",
        source: 'export function createPumpkinWorker() { return new Worker(new URL("./pumpkin-worker.js", import.meta.url), { type: "module" }); }\n',
      });
      this.emitFile({
        type: "asset",
        fileName: "pumpkin-node-runtime.js",
        source:
          'export async function readPumpkinWasmFileUrl(fileUrl) {\n' +
          '  const [{ readFile }] = await Promise.all([import(/* webpackIgnore: true */ /* @vite-ignore */ "node:fs/promises")]);\n' +
          '  const buf = await readFile(fileUrl);\n' +
          '  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);\n' +
          '}\n' +
          'export async function readBundledPumpkinWasmBytes() {\n' +
          '  const [{ fileURLToPath }] = await Promise.all([import(/* webpackIgnore: true */ /* @vite-ignore */ "node:url")]);\n' +
          '  const tried = [];\n' +
          '  for (const rel of ["./pumpkin.wasm", "../../../public/solvers/pumpkin.wasm"]) {\n' +
          '    const fileUrl = new URL(rel, import.meta.url);\n' +
          '    tried.push(fileURLToPath(fileUrl));\n' +
          '    try { return await readPumpkinWasmFileUrl(fileUrl); } catch {}\n' +
          '  }\n' +
          '  throw new Error(`[WaSHI] Bundled pumpkin.wasm could not be found in Node.js (tried: ${tried.join(", ")}); no CDN fallback is attempted.`);\n' +
          '}\n',
      });
      this.emitFile({ type: "asset", fileName: "pumpkin.wasm", source: pumpkinWasm() });
      this.emitFile({ type: "asset", fileName: "pumpkin.wasm.LICENSE", source: pumpkinLicense() });

      this.emitFile({
        type: "asset",
        fileName: "z3-assets.js",
        source: 'export function getBundledZ3AssetUrls() { return { jsUrl: new URL("./z3-built.js", import.meta.url).href, wasmUrl: new URL("./z3-built.wasm", import.meta.url).href }; }\n',
      });
      this.emitFile({ type: "asset", fileName: "z3-built.js", source: z3Js() });
      this.emitFile({ type: "asset", fileName: "z3-built.wasm", source: z3Wasm() });
    },
  };
}

/** Browser distributions place all solver artifacts uniformly under solvers/ (while IIFE washi.min.js bundles both HiGHS and Pumpkin). */
export function browserAssets(format: "es" | "iife", target: "core" | "highs" | "pumpkin" | "glpk" | "z3" = "core"): Plugin {
  const assetsId = "\0washi-browser-assets";
  const z3AssetsId = "\0washi-browser-z3-assets";
  const factoryId = "\0washi-browser-worker-factory";
  const pumpkinAssetsId = "\0washi-browser-pumpkin-assets";
  const pumpkinFactoryId = "\0washi-browser-pumpkin-worker-factory";
  const pumpkinNodeId = "\0washi-pumpkin-node-runtime";
  const optionalId = "\0washi-optional-engine";
  const nodeId = "\0washi-node-only";
  const base =
    format === "es"
      ? "const assetBase = import.meta.url;"
      : 'const scriptUrl = typeof document !== "undefined" ? document.currentScript?.src : null;\n' +
        'const assetBase = scriptUrl ? new URL(".", scriptUrl).href : null;';
  const solverPrefix = format === "iife" && target === "core" ? "solvers/" : "";
  return {
    name: "washi-browser-assets",
    enforce: "pre",
    resolveId(id, importer) {
      if (
        [
          assetsId,
          z3AssetsId,
          factoryId,
          pumpkinAssetsId,
          pumpkinFactoryId,
          pumpkinNodeId,
          optionalId,
          nodeId,
        ].includes(id)
      ) {
        return id;
      }
      if (target === "core" && format === "es" && isSolversIndexImporter(importer)) {
        if (id === "./highs.js" || id === "./highs/index.js") return { id: "./solvers/highs.js", external: true };
        if (id === "./pumpkin.js" || id === "./pumpkin/index.js") return { id: "./solvers/pumpkin.js", external: true };
      }
      if (target === "pumpkin" || isImporterInSolver(importer, "pumpkin")) {
        if (id === "./pumpkin-assets.js" || id === "./assets.js" || id.endsWith("/pumpkin/assets.js")) return pumpkinAssetsId;
        if (id === "./pumpkin-worker-factory.js" || id === "./worker-factory.js" || id.endsWith("/pumpkin/worker-factory.js")) return pumpkinFactoryId;
        if (id === "./pumpkin-node-runtime.js" || id === "./node-runtime.js" || id.endsWith("/pumpkin/node-runtime.js")) return pumpkinNodeId;
      }
      if (target === "z3" || isImporterInSolver(importer, "z3")) {
        if (id === "./z3-assets.js" || id === "./assets.js" || id.endsWith("/z3/assets.js")) return z3AssetsId;
      }
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

      if (["glpk.js", "glpk.js/node", "z3-solver"].includes(id)) return optionalId;
      if (id.startsWith("node:") || ["fs", "path", "url"].includes(id)) return nodeId;
    },
    load(id) {
      if (id === assetsId) {
        return `${base}
        export function getAssetUrl(name) {
          if (!assetBase) throw new Error("[WaSHI] Load the browser IIFE using an external script src, or use the browser ESM build.");
          return new URL(name, assetBase).href;
        }
        export function getBundledWasmUrl() { return getAssetUrl("${solverPrefix}highs.wasm"); }`;
      }
      if (id === z3AssetsId) {
        return `${base}
        function getAssetUrl(name) {
          if (!assetBase) throw new Error("[WaSHI] Load the browser IIFE using an external script src, or use the browser ESM build.");
          return new URL(name, assetBase).href;
        }
        export function getBundledZ3AssetUrls() {
          return {
            jsUrl: getAssetUrl("${solverPrefix}z3-built.js"),
            wasmUrl: getAssetUrl("${solverPrefix}z3-built.wasm"),
          };
        }`;
      }
      if (id === factoryId) {
        return `import { getAssetUrl } from ${JSON.stringify(assetsId)};
        export function createHighsWorker() {
          const url = getAssetUrl("${solverPrefix}highs-worker.js");
          const effectiveOrigin = typeof window.origin === "string" ? window.origin : window.location?.origin;
          if (new URL(url).origin === effectiveOrigin) return new Worker(url, { type: "module" });
          const bootstrap = URL.createObjectURL(new Blob(["import " + JSON.stringify(url) + ";"], { type: "text/javascript" }));
          try {
            const worker = new Worker(bootstrap, { type: "module" });
            const release = () => URL.revokeObjectURL(bootstrap);
            worker.addEventListener("message", release, { once: true });
            worker.addEventListener("error", release, { once: true });
            return worker;
          } catch (error) { URL.revokeObjectURL(bootstrap); throw error; }
        }`;
      }
      if (id === pumpkinAssetsId) {
        return `${base}
        export function getAssetUrl(name) {
          if (!assetBase) throw new Error("[WaSHI] Load the browser IIFE using an external script src, or use the browser ESM build.");
          return new URL(name, assetBase).href;
        }
        export function getBundledPumpkinWasmUrl() { return getAssetUrl("${solverPrefix}pumpkin.wasm"); }`;
      }
      if (id === pumpkinFactoryId) {
        return `import { getAssetUrl } from ${JSON.stringify(pumpkinAssetsId)};
        export function createPumpkinWorker() {
          const url = getAssetUrl("${solverPrefix}pumpkin-worker.js");
          const effectiveOrigin = typeof window.origin === "string" ? window.origin : window.location?.origin;
          if (new URL(url).origin === effectiveOrigin) return new Worker(url, { type: "module" });
          const bootstrap = URL.createObjectURL(new Blob(["import " + JSON.stringify(url) + ";"], { type: "text/javascript" }));
          try {
            const worker = new Worker(bootstrap, { type: "module" });
            const release = () => URL.revokeObjectURL(bootstrap);
            worker.addEventListener("message", release, { once: true });
            worker.addEventListener("error", release, { once: true });
            return worker;
          } catch (error) { URL.revokeObjectURL(bootstrap); throw error; }
        }`;
      }
      if (id === pumpkinNodeId) {
        return `export async function readPumpkinWasmFileUrl() { throw new Error("This distribution is for browsers. Use the npm entry in Node.js."); }
        export async function readBundledPumpkinWasmBytes() { throw new Error("This distribution is for browsers. Use the npm entry in Node.js."); }`;
      }
      if (id === optionalId) {
        return `export default function unavailable() { throw new Error("[WaSHI] Optional GLPK/Z3 engines are not included in the core browser bundle. Import the plugin module or include its script tag."); }
        export const init = unavailable;`;
      }
      if (id === nodeId) return "export default {};";
      if (id === "\0washi-node-runtime") {
        return 'export function loadNodeHighs() { throw new Error("This distribution is for browsers. Use the npm entry in Node.js."); }';
      }
    },
    generateBundle() {
      if (target === "highs" && format === "es") {
        this.emitFile({ type: "asset", fileName: "highs.wasm", source: wasm() });
        this.emitFile({ type: "asset", fileName: "highs.wasm.LICENSE", source: license() });
      }
      if (target === "pumpkin" && format === "es") {
        this.emitFile({ type: "asset", fileName: "pumpkin.wasm", source: pumpkinWasm() });
        this.emitFile({ type: "asset", fileName: "pumpkin.wasm.LICENSE", source: pumpkinLicense() });
      }
      if (target === "z3" && format === "es") {
        this.emitFile({ type: "asset", fileName: "solvers/z3-built.js", source: z3Js() });
        this.emitFile({ type: "asset", fileName: "solvers/z3-built.wasm", source: z3Wasm() });
      }
    },
  };
}
