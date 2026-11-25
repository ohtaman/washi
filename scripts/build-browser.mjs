import { build } from "vite";

// 1. Core ESM (washi.js)
delete process.env.WASHI_BROWSER_FORMAT;
process.env.WASHI_BROWSER_TARGET = "core";
await build({ configFile: "vite.config.browser.ts" });

// 2. Core IIFE (washi.min.js — bundles both HiGHS and Pumpkin)
process.env.WASHI_BROWSER_FORMAT = "iife";
process.env.WASHI_BROWSER_TARGET = "core";
await build({ configFile: "vite.config.browser.ts" });

// 3. Bundled HiGHS ESM (solvers/highs.js, solvers/highs-worker.js, solvers/highs.wasm)
delete process.env.WASHI_BROWSER_FORMAT;
process.env.WASHI_BROWSER_TARGET = "highs";
await build({ configFile: "vite.config.browser.ts" });

// 4. Bundled Pumpkin ESM (solvers/pumpkin.js, solvers/pumpkin-worker.js, solvers/pumpkin.wasm)
delete process.env.WASHI_BROWSER_FORMAT;
process.env.WASHI_BROWSER_TARGET = "pumpkin";
await build({ configFile: "vite.config.browser.ts" });

// 5. Optional GLPK ESM (solvers/glpk.js)
delete process.env.WASHI_BROWSER_FORMAT;
process.env.WASHI_BROWSER_TARGET = "glpk";
await build({ configFile: "vite.config.browser.ts" });

// 6. Optional GLPK IIFE (solvers/glpk.min.js)
process.env.WASHI_BROWSER_FORMAT = "iife";
process.env.WASHI_BROWSER_TARGET = "glpk";
await build({ configFile: "vite.config.browser.ts" });

// 7. Optional Z3 ESM (solvers/z3.js, solvers/z3-built.*)
delete process.env.WASHI_BROWSER_FORMAT;
process.env.WASHI_BROWSER_TARGET = "z3";
await build({ configFile: "vite.config.browser.ts" });

// 8. Optional Z3 IIFE (solvers/z3.min.js)
process.env.WASHI_BROWSER_FORMAT = "iife";
process.env.WASHI_BROWSER_TARGET = "z3";
await build({ configFile: "vite.config.browser.ts" });
