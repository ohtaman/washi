export * from "./types.js";
export * from "./registry.js";
export * from "./mock.js";

// Auto-register bundled zero-dependency solvers (HiGHS as default; Pumpkin ready under "pumpkin")
import "./highs.js";
import "./pumpkin.js";
