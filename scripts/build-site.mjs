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
  if (existsSync(resolve(targetRoot, "exercises", "index.html"))) {
    interactiveSubpaths.push("exercises/");
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

const SHARED_PUBLIC_ASSETS = [
  "washi-logo.svg",
  "washi-logo.png",
  "washi-header.svg",
  "washi-header-light.png",
  "washi-header-dark.png",
  "coi-serviceworker.js",
  "z3-built.js",
  "z3-built.wasm",
  "highs.wasm",
  "pumpkin.wasm",
];

function assertRequiredArtifact(targetPath, description) {
  if (!existsSync(targetPath)) {
    throw new Error(`[WaSHI] Missing required ${description}: ${targetPath}`);
  }
}

/**
 * Assembles the unified static site (`docs/.vitepress/dist` + `dist/demo` + `llms` assets)
 * into `siteDist`, failing loudly if any required build artifact or WASM file is missing.
 */
export function assembleUnifiedSite({
  rootDir: targetRootDir = rootDir,
  docsDist: targetDocsDist = docsDist,
  demoDist: targetDemoDist = demoDist,
  siteDist: targetSiteDist = siteDist,
} = {}) {
  assertRequiredArtifact(targetDocsDist, "docs build directory");
  assertRequiredArtifact(targetDemoDist, "demo build directory");

  if (existsSync(targetSiteDist)) {
    rmSync(targetSiteDist, { recursive: true, force: true });
  }
  mkdirSync(targetSiteDist, { recursive: true });

  // Copy all documentation assets to site root
  cpSync(targetDocsDist, targetSiteDist, { recursive: true });

  // Write llms.txt, llms-full.txt, and raw English .md endpoints into dist/site
  const llmsArtifacts = generateLlms(targetRootDir);
  populateSiteLlmsAssets(targetSiteDist, targetRootDir, llmsArtifacts);

  // Copy required interactive directories (demo, exercises, apps, games) into site root
  for (const section of ["demo", "exercises", "apps", "games"]) {
    const src = resolve(targetDemoDist, section);
    assertRequiredArtifact(src, `demo build section "${section}"`);
    const target = resolve(targetSiteDist, section);
    mkdirSync(target, { recursive: true });
    cpSync(src, target, { recursive: true });
  }

  // Append standalone interactive routes (demo, exercises, apps/*, games/*) to sitemap.xml
  const sitemapPath = resolve(targetSiteDist, "sitemap.xml");
  assertRequiredArtifact(sitemapPath, "sitemap.xml");
  const rawSitemap = readFileSync(sitemapPath, "utf-8");
  const updatedSitemap = appendInteractiveRoutesToSitemap(rawSitemap, targetSiteDist);
  writeFileSync(sitemapPath, updatedSitemap, "utf-8");

  // Copy demo built assets (CSS, JS, Web Workers, WASM) into site /assets/
  const demoAssetsSrc = resolve(targetDemoDist, "assets");
  assertRequiredArtifact(demoAssetsSrc, "demo assets directory");
  cpSync(demoAssetsSrc, resolve(targetSiteDist, "assets"), { recursive: true });

  // Copy shared public assets from demo (wasm files, workers, icons, header logos)
  const demoTarget = resolve(targetSiteDist, "demo");
  for (const file of SHARED_PUBLIC_ASSETS) {
    const src = resolve(targetDemoDist, file);
    assertRequiredArtifact(src, `shared public asset "${file}"`);
    cpSync(src, resolve(targetSiteDist, file), { recursive: true });

    const destDemo = resolve(demoTarget, file);
    if (!existsSync(destDemo)) {
      cpSync(src, destDemo, { recursive: true });
    }
  }
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
  assembleUnifiedSite();

  console.log("\n✅ Successfully assembled unified site at dist/site!");
}
