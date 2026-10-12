import "../style.css";
import "./ai-shift.css";
import { setHighsWasmUrl } from "../../../../src/index.js";
import { setZ3Assets } from "../../../../src/modeler/solvers/z3/loader.js";
import { AIShiftApp } from "./ui.js";
import { initTheme } from "../ui/theme.js";

// Initialize WASM assets URLs
if (typeof window !== "undefined") {
  let wasmUrl: string;
  let z3JsUrl: string;
  let z3WasmUrl: string;

  if (import.meta.env.DEV) {
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
      wasmUrl = new URL("../highs.wasm", window.location.href).href;
      z3JsUrl = new URL("../z3-built.js", window.location.href).href;
      z3WasmUrl = new URL("../z3-built.wasm", window.location.href).href;
    }
  }
  setHighsWasmUrl(wasmUrl);
  setZ3Assets({ jsUrl: z3JsUrl, wasmUrl: z3WasmUrl });
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  const app = new AIShiftApp();
  app.init().catch(console.error);
});
