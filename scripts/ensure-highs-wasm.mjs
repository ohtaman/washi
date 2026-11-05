#!/usr/bin/env node
// ==============================================================================
// scripts/ensure-highs-wasm.mjs
//
// Ensures HiGHS WebAssembly (public/highs.wasm) and runtime (runtime.js) exist
// and match the configured version and SHA-256 hash in highs.config.json.
//
// Lifecycle:
// 1. If files exist and hashes match -> Instant exit 0 (fast path for dev & CI).
// 2. If missing or mismatched:
//    a. Download prebuilt asset from release URL if configured and valid.
//    b. If download fails or unavailable, and Emscripten (emcc) is installed:
//       compile from source via scripts/build-highs-wasm.sh.
//    c. Otherwise fail with actionable instructions.
// ==============================================================================

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const configPath = path.resolve(repoRoot, "highs.config.json");

export function loadConfig(customPath = configPath) {
  if (!fs.existsSync(customPath)) {
    throw new Error(`[WaSHI] highs.config.json not found at: ${customPath}`);
  }
  return JSON.parse(fs.readFileSync(customPath, "utf-8"));
}

export function computeSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export function updateHashes(customPath = configPath) {
  const config = loadConfig(customPath);
  const wasmFile = path.resolve(repoRoot, config.wasm.path);
  const runtimeFile = path.resolve(repoRoot, config.runtime.path);

  const wasmSha = computeSha256(wasmFile);
  const runtimeSha = computeSha256(runtimeFile);

  if (!wasmSha) throw new Error(`[WaSHI] Cannot update hash: ${wasmFile} does not exist.`);
  if (!runtimeSha) throw new Error(`[WaSHI] Cannot update hash: ${runtimeFile} does not exist.`);

  config.wasm.sha256 = wasmSha;
  config.runtime.sha256 = runtimeSha;

  fs.writeFileSync(customPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  console.log(`[WaSHI] Updated SHA-256 hashes in highs.config.json`);
  return config;
}

export function checkAssetsMatch(config, root = repoRoot) {
  const wasmPath = path.resolve(root, config.wasm.path);
  const runtimePath = path.resolve(root, config.runtime.path);

  if (!fs.existsSync(wasmPath)) return { valid: false, reason: "missing_wasm", path: wasmPath };
  if (!fs.existsSync(runtimePath)) return { valid: false, reason: "missing_runtime", path: runtimePath };

  const currentWasmSha = computeSha256(wasmPath);
  if (config.wasm.sha256 && currentWasmSha !== config.wasm.sha256) {
    return {
      valid: false,
      reason: "sha_mismatch_wasm",
      expected: config.wasm.sha256,
      actual: currentWasmSha,
    };
  }

  const currentRuntimeSha = computeSha256(runtimePath);
  if (config.runtime.sha256 && currentRuntimeSha !== config.runtime.sha256) {
    return {
      valid: false,
      reason: "sha_mismatch_runtime",
      expected: config.runtime.sha256,
      actual: currentRuntimeSha,
    };
  }

  return { valid: true };
}

async function downloadAsset(url, targetPath, expectedSha256) {
  console.log(`[WaSHI] Downloading ${path.basename(targetPath)} from ${url}...`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (expectedSha256) {
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    if (hash !== expectedSha256) {
      throw new Error(`SHA-256 mismatch for downloaded file (expected: ${expectedSha256}, actual: ${hash})`);
    }
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, buffer);
  console.log(`[WaSHI] Successfully verified and saved ${path.basename(targetPath)}`);
}

function hasEmscripten() {
  try {
    execSync("emcc --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function ensureHighsAssets(options = {}) {
  const config = options.config || loadConfig(options.configPath);
  const check = checkAssetsMatch(config, options.repoRoot || repoRoot);

  if (check.valid && !options.forceBuild) {
    if (!options.silent) {
      console.log(`[WaSHI] HiGHS WebAssembly assets are up to date (${config.version}).`);
    }
    return { status: "cached", config };
  }

  if (options.checkOnly) {
    return { status: "invalid", check };
  }

  console.log(`[WaSHI] HiGHS asset check: ${check.reason || "force_build"}. Target version: ${config.version}`);

  // Step 1: Attempt download from release URLs if available
  if (!options.forceBuild && config.wasm?.downloadUrl && config.runtime?.downloadUrl) {
    try {
      const wasmTarget = path.resolve(options.repoRoot || repoRoot, config.wasm.path);
      const runtimeTarget = path.resolve(options.repoRoot || repoRoot, config.runtime.path);

      await downloadAsset(config.wasm.downloadUrl, wasmTarget, config.wasm.sha256);
      await downloadAsset(config.runtime.downloadUrl, runtimeTarget, config.runtime.sha256);

      return { status: "downloaded", config };
    } catch (err) {
      console.warn(`[WaSHI] Download from release URL failed: ${err.message}.`);
    }
  }

  // Step 2: Attempt compiling from source if Emscripten is available
  if (hasEmscripten()) {
    console.log(`[WaSHI] Emscripten detected. Compiling HiGHS ${config.version} from source...`);
    const buildScript = path.resolve(options.repoRoot || repoRoot, "scripts/build-highs-wasm.sh");
    execSync(`bash "${buildScript}"`, {
      stdio: "inherit",
      env: {
        ...process.env,
        HIGHS_VERSION: config.version,
        HIGHS_REPO: config.repo,
      },
    });

    const postCheck = checkAssetsMatch(config, options.repoRoot || repoRoot);
    if (!postCheck.valid && options.updateHashesOnBuild) {
      updateHashes(options.configPath || configPath);
    }
    return { status: "compiled", config };
  }

  // Step 3: Failure
  throw new Error(
    `[WaSHI] HiGHS WebAssembly assets (${config.wasm.path}, ${config.runtime.path}) are missing or out of date with ${config.version}.\n` +
    `Neither prebuilt asset download succeeded nor is Emscripten (emcc) installed on PATH.\n` +
    `Please install Emscripten SDK and run "npm run build:highs-wasm", or restore the verified prebuilt assets.`
  );
}

// CLI entry point
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args.includes("--update-hashes")) {
    updateHashes();
    process.exit(0);
  }

  if (args.includes("--check")) {
    const config = loadConfig();
    const result = checkAssetsMatch(config);
    if (!result.valid) {
      console.error(`[WaSHI] Asset check failed: ${result.reason}`);
      process.exit(1);
    }
    console.log(`[WaSHI] Asset check passed (${config.version}).`);
    process.exit(0);
  }

  const forceBuild = args.includes("--force-build");
  ensureHighsAssets({ forceBuild })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
