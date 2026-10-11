import "./style.css";
import { initApp } from "./ui/app.js";
import { setHighsWasmUrl } from "../../../src/index.js";
import { setZ3Assets } from "../../../src/modeler/solvers/z3/loader.js";

// Ensure WASM and solver assets are loaded from the correct base URL (local dev, preview, or GitHub Pages /washi/)
if (typeof window !== "undefined") {
  let wasmUrl: string;
  let z3JsUrl: string;
  let z3WasmUrl: string;

  if (import.meta.env.DEV) {
    // In Vite dev server, public files and middleware assets are served from origin root
    wasmUrl = new URL("/highs.wasm", window.location.origin).href;
    z3JsUrl = new URL("/z3-built.js", window.location.origin).href;
    z3WasmUrl = new URL("/z3-built.wasm", window.location.origin).href;
  } else {
    const base = import.meta.env.BASE_URL || "/";
    if (base.startsWith("/")) {
      const cleanBase = base.endsWith("/") ? base : `${base}/`;
      wasmUrl = new URL(`${cleanBase}highs.wasm`, window.location.origin).href;
      z3JsUrl = new URL(`${cleanBase}z3-built.js`, window.location.origin).href;
      z3WasmUrl = new URL(`${cleanBase}z3-built.wasm`, window.location.origin).href;
    } else {
      // Relative base deployment from /demo/
      wasmUrl = new URL("../highs.wasm", window.location.href).href;
      z3JsUrl = new URL("../z3-built.js", window.location.href).href;
      z3WasmUrl = new URL("../z3-built.wasm", window.location.href).href;
    }
  }
  setHighsWasmUrl(wasmUrl);
  setZ3Assets({ jsUrl: z3JsUrl, wasmUrl: z3WasmUrl });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initApp();
  });
} else {
  initApp();
}
