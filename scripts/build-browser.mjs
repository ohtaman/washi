import { build } from "vite";

// 1. Core ESM (washi.js, highs-worker.js, highs.wasm, solvers/z3-built.*)
delete process.env.WASHI_BROWSER_FORMAT;
process.env.WASHI_BROWSER_TARGET = "core";
await build({ configFile: "vite.config.browser.ts" });

// 2. Core IIFE (washi.min.js)
process.env.WASHI_BROWSER_FORMAT = "iife";
process.env.WASHI_BROWSER_TARGET = "core";
await build({ configFile: "vite.config.browser.ts" });

// 3. GLPK ESM (solvers/glpk.js)
delete process.env.WASHI_BROWSER_FORMAT;
process.env.WASHI_BROWSER_TARGET = "glpk";
await build({ configFile: "vite.config.browser.ts" });

// 4. GLPK IIFE (solvers/glpk.min.js)
process.env.WASHI_BROWSER_FORMAT = "iife";
process.env.WASHI_BROWSER_TARGET = "glpk";
await build({ configFile: "vite.config.browser.ts" });

// 5. Z3 ESM (solvers/z3.js)
delete process.env.WASHI_BROWSER_FORMAT;
process.env.WASHI_BROWSER_TARGET = "z3";
await build({ configFile: "vite.config.browser.ts" });

// 6. Z3 IIFE (solvers/z3.min.js)
process.env.WASHI_BROWSER_FORMAT = "iife";
process.env.WASHI_BROWSER_TARGET = "z3";
await build({ configFile: "vite.config.browser.ts" });
