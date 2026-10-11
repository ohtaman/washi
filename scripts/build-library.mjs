import { build } from "vite";

await build({ configFile: "vite.config.lib.ts" });
process.env.WASHI_BROWSER_FORMAT = "runtime";
await build({ configFile: "vite.config.browser.ts" });
