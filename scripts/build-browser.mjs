import { build } from "vite";

await build({ configFile: "vite.config.browser.ts" });
process.env.WASHI_BROWSER_FORMAT = "iife";
await build({ configFile: "vite.config.browser.ts" });
