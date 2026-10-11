import "./style.css";
import { initApp } from "./ui/app.js";
import { setHighsWasmUrl } from "../../../src/index.js";

// Ensure WASM is loaded from the correct base URL (local dev, preview, or GitHub Pages /washi/)
if (typeof window !== "undefined") {
  let wasmUrl: string;
  if (import.meta.env.DEV) {
    // In Vite dev server, public files are always served from origin root
    wasmUrl = new URL("/highs.wasm", window.location.origin).href;
  } else {
    const base = import.meta.env.BASE_URL || "/";
    if (base.startsWith("/")) {
      const cleanBase = base.endsWith("/") ? base : `${base}/`;
      wasmUrl = new URL(`${cleanBase}highs.wasm`, window.location.origin).href;
    } else {
      // Relative base deployment from /demo/
      wasmUrl = new URL("../highs.wasm", window.location.href).href;
    }
  }
  setHighsWasmUrl(wasmUrl);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initApp();
  });
} else {
  initApp();
}
