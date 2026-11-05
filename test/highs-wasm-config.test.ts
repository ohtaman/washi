import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  loadConfig,
  computeSha256,
  checkAssetsMatch,
  ensureHighsAssets,
} from "../scripts/ensure-highs-wasm.mjs";

describe("HiGHS WebAssembly Config & Lifecycle (highs.config.json)", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const config = loadConfig();

  it("has valid highs.config.json structure with version, repo, and hashes", () => {
    expect(config.version).toMatch(/^v\d+\.\d+\.\d+/);
    expect(config.repo).toBe("https://github.com/ERGO-Code/HiGHS.git");
    expect(config.wasm?.path).toBe("public/highs.wasm");
    expect(config.wasm?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(config.runtime?.path).toBe("src/modeler/solvers/highs/runtime.js");
    expect(config.runtime?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(config.wasm?.downloadUrl).toContain("releases/download");
    expect(config.runtime?.downloadUrl).toContain("releases/download");
  });

  it("verifies current repository wasm and runtime match highs.config.json hashes exactly", () => {
    const wasmFile = path.resolve(repoRoot, config.wasm.path);
    const runtimeFile = path.resolve(repoRoot, config.runtime.path);

    expect(fs.existsSync(wasmFile)).toBe(true);
    expect(fs.existsSync(runtimeFile)).toBe(true);

    const wasmSha = computeSha256(wasmFile);
    const runtimeSha = computeSha256(runtimeFile);

    expect(wasmSha).toBe(config.wasm.sha256);
    expect(runtimeSha).toBe(config.runtime.sha256);

    const check = checkAssetsMatch(config, repoRoot);
    expect(check.valid).toBe(true);
  });

  it("detects missing wasm file in simulated root", () => {
    const fakeConfig = {
      ...config,
      wasm: { ...config.wasm, path: "public/nonexistent.wasm" },
    };
    const check = checkAssetsMatch(fakeConfig, repoRoot);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe("missing_wasm");
  });

  it("detects missing runtime file in simulated root", () => {
    const fakeConfig = {
      ...config,
      runtime: { ...config.runtime, path: "src/nonexistent-runtime.js" },
    };
    const check = checkAssetsMatch(fakeConfig, repoRoot);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe("missing_runtime");
  });

  it("detects SHA-256 hash mismatch when config expected hash changes", () => {
    const fakeConfig = {
      ...config,
      wasm: {
        ...config.wasm,
        sha256: "0000000000000000000000000000000000000000000000000000000000000000",
      },
    };
    const check = checkAssetsMatch(fakeConfig, repoRoot);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe("sha_mismatch_wasm");
    expect(check.expected).toBe("0000000000000000000000000000000000000000000000000000000000000000");
  });

  it("ensureHighsAssets() returns cached status on existing up-to-date assets", async () => {
    const result = await ensureHighsAssets({ config, repoRoot, silent: true });
    expect(result.status).toBe("cached");
  });

  it("fails with actionable message when assets are invalid and download fails without emcc", async () => {
    const brokenConfig = {
      version: "v9.9.9",
      repo: "https://github.com/ERGO-Code/HiGHS.git",
      wasm: {
        path: "public/nonexistent-test.wasm",
        sha256: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        downloadUrl: "https://invalid.example.com/nonexistent.wasm",
      },
      runtime: {
        path: "src/modeler/solvers/highs/nonexistent-runtime.js",
        sha256: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        downloadUrl: "https://invalid.example.com/nonexistent.js",
      },
    };

    await expect(
      ensureHighsAssets({
        config: brokenConfig,
        repoRoot,
        silent: true,
      })
    ).rejects.toThrowError(/HiGHS WebAssembly assets.*are missing or out of date/);
  });

  it("successfully downloads and validates assets from release URL into a clean target directory", async () => {
    const tmpDir = path.resolve(repoRoot, ".temp-wasm-test-" + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const result = await ensureHighsAssets({
        config,
        repoRoot: tmpDir,
        silent: true,
      });

      expect(result.status).toBe("downloaded");

      const downloadedWasm = path.resolve(tmpDir, config.wasm.path);
      const downloadedRuntime = path.resolve(tmpDir, config.runtime.path);

      expect(fs.existsSync(downloadedWasm)).toBe(true);
      expect(fs.existsSync(downloadedRuntime)).toBe(true);
      expect(computeSha256(downloadedWasm)).toBe(config.wasm.sha256);
      expect(computeSha256(downloadedRuntime)).toBe(config.runtime.sha256);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
