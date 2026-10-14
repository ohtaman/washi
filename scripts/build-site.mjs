import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "..");
const docsDist = resolve(rootDir, "docs/.vitepress/dist");
const demoDist = resolve(rootDir, "dist/demo");
const siteDist = resolve(rootDir, "dist/site");

console.log("=== Building WaSHI Unified Site (Docs + Demo) ===");

// 1. Build Docs via VitePress
console.log("\n1. Building VitePress Documentation...");
execSync("npm run docs:build", { stdio: "inherit", cwd: rootDir });

// 2. Build Interactive Demo via Vite
console.log("\n2. Building Interactive Web Demo...");
execSync("npm run build:demo", {
  stdio: "inherit",
  cwd: rootDir,
  env: { ...process.env, GITHUB_ACTIONS: "true" },
});

// 3. Assemble unified site into dist/site
console.log("\n3. Assembling unified site into dist/site...");
if (existsSync(siteDist)) {
  rmSync(siteDist, { recursive: true, force: true });
}
mkdirSync(siteDist, { recursive: true });

// Copy all documentation assets to site root
cpSync(docsDist, siteDist, { recursive: true });

// Copy demo directory into site /demo/
const demoTarget = resolve(siteDist, "demo");
mkdirSync(demoTarget, { recursive: true });
if (existsSync(resolve(demoDist, "demo"))) {
  cpSync(resolve(demoDist, "demo"), demoTarget, { recursive: true });
}

// Copy demo built assets (CSS, JS, Web Workers, WASM) into site /assets/
if (existsSync(resolve(demoDist, "assets"))) {
  cpSync(resolve(demoDist, "assets"), resolve(siteDist, "assets"), { recursive: true });
}

// Copy shared public assets from demo (wasm files, workers, icons, header logos)
const filesToCopy = [
  "washi-logo.svg",
  "washi-logo.png",
  "washi-header.svg",
  "washi-header-light.png",
  "washi-header-dark.png",
  "coi-serviceworker.js",
  "z3-built.js",
  "z3-built.wasm",
  "highs.wasm",
];

for (const file of filesToCopy) {
  const src = resolve(demoDist, file);
  const dest = resolve(siteDist, file);
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
  }
}

// Also ensure demo has copies of shared assets if needed
for (const file of filesToCopy) {
  const src = resolve(demoDist, file);
  const destDemo = resolve(demoTarget, file);
  if (existsSync(src) && !existsSync(destDemo)) {
    cpSync(src, destDemo, { recursive: true });
  }
}

console.log("\n✅ Successfully assembled unified site at dist/site!");
