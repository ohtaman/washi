import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateLlms, populateSiteLlmsAssets } from "./generate-llms.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const docsDist = resolve(rootDir, "docs/.vitepress/dist");
const demoDist = resolve(rootDir, "dist/demo");
const siteDist = resolve(rootDir, "dist/site");

/**
 * Discovers standalone interactive routes (`demo/`, `apps/<name>/`, `games/<name>/`) inside `targetRoot`
 * and appends their canonical `<url><loc>...</loc></url>` entries to `sitemapXml`.
 */
export function appendInteractiveRoutesToSitemap(
  sitemapXml,
  targetRoot,
  baseHostname = "https://washi.ohtaman.dev/"
) {
  const interactiveSubpaths = [];

  if (existsSync(resolve(targetRoot, "demo", "index.html"))) {
    interactiveSubpaths.push("demo/");
  }

  for (const section of ["apps", "games"]) {
    const sectionDir = resolve(targetRoot, section);
    if (!existsSync(sectionDir)) continue;
    const entries = readdirSync(sectionDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(resolve(sectionDir, d.name, "index.html")))
      .map((d) => `${section}/${d.name}/`)
      .sort();
    interactiveSubpaths.push(...entries);
  }

  const extraUrlNodes = interactiveSubpaths
    .map((sub) => `${baseHostname}${sub}`)
    .filter((url) => !sitemapXml.includes(`<loc>${url}</loc>`))
    .map((url) => `<url><loc>${url}</loc></url>`)
    .join("");

  if (extraUrlNodes && sitemapXml.includes("</urlset>")) {
    return sitemapXml.replace("</urlset>", `${extraUrlNodes}</urlset>`);
  }
  return sitemapXml;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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

  // Write llms.txt, llms-full.txt, and raw English .md endpoints into dist/site
  const llmsArtifacts = generateLlms(rootDir);
  populateSiteLlmsAssets(siteDist, rootDir, llmsArtifacts);

  // Copy demo directory into site /demo/
  const demoTarget = resolve(siteDist, "demo");
  mkdirSync(demoTarget, { recursive: true });
  if (existsSync(resolve(demoDist, "demo"))) {
    cpSync(resolve(demoDist, "demo"), demoTarget, { recursive: true });
  }

  // Copy apps showcase directory into site /apps/
  const appsTarget = resolve(siteDist, "apps");
  if (existsSync(resolve(demoDist, "apps"))) {
    mkdirSync(appsTarget, { recursive: true });
    cpSync(resolve(demoDist, "apps"), appsTarget, { recursive: true });
  }

  // Copy games showcase directory into site /games/
  const gamesTarget = resolve(siteDist, "games");
  if (existsSync(resolve(demoDist, "games"))) {
    mkdirSync(gamesTarget, { recursive: true });
    cpSync(resolve(demoDist, "games"), gamesTarget, { recursive: true });
  }

  // Append standalone interactive routes (demo, apps/*, games/*) to sitemap.xml
  const sitemapPath = resolve(siteDist, "sitemap.xml");
  if (existsSync(sitemapPath)) {
    const rawSitemap = readFileSync(sitemapPath, "utf-8");
    const updatedSitemap = appendInteractiveRoutesToSitemap(rawSitemap, siteDist);
    writeFileSync(sitemapPath, updatedSitemap, "utf-8");
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
}
