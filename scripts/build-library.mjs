import { build } from "vite";
import { generateLlms } from "./generate-llms.mjs";

delete process.env.WASHI_LIB_TARGET;
delete process.env.WASHI_BROWSER_FORMAT;
delete process.env.WASHI_BROWSER_TARGET;
await build({ configFile: "vite.config.lib.ts" });

process.env.WASHI_LIB_TARGET = "pumpkin";
try {
  await build({ configFile: "vite.config.lib.ts" });
} finally {
  delete process.env.WASHI_LIB_TARGET;
}

process.env.WASHI_BROWSER_FORMAT = "runtime";
delete process.env.WASHI_BROWSER_TARGET;
try {
  await build({ configFile: "vite.config.browser.ts" });
} finally {
  delete process.env.WASHI_BROWSER_FORMAT;
}

generateLlms();
