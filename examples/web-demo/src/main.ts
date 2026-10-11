import "./style.css";
import { initApp } from "./ui/app.js";
import { setHighsWasmUrl } from "../../../src/index.js";

// Ensure WASM is loaded from the correct base URL (e.g. GitHub Pages or subpath deployment)
if (typeof window !== "undefined") {
  const baseWasmUrl = new URL("highs.wasm", window.location.href).href;
  setHighsWasmUrl(baseWasmUrl);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initApp();
  });
} else {
  initApp();
}
