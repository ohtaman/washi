import { describe, it, expect, vi } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  loadConfig,
  computeSha256,
  checkAssetsMatch,
  ensureHighsAssets,
} from "../scripts/ensure-highs-wasm.mjs";
import { isValidWasmHeader } from "../src/modeler/solvers/highs/loader.js";
import { Model, expr, maximize, sum, type Var } from "../src/index.js";

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
    expect(isValidWasmHeader(fs.readFileSync(wasmFile))).toBe(true);

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

  it("fails with actionable message when assets are invalid and download fails", async () => {
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

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network connection disabled"));

    try {
      await expect(
        ensureHighsAssets({
          config: brokenConfig,
          repoRoot,
          silent: true,
        })
      ).rejects.toThrowError(/Failed to download HiGHS WebAssembly assets/);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("successfully downloads and validates assets using controlled fixtures", async () => {
    const tmpDir = path.resolve(repoRoot, ".temp-wasm-test-" + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    const fixtureWasm = Buffer.from("\x00asm\x01\x00\x00\x00controlled-test-wasm");
    const fixtureRuntime = Buffer.from("// controlled-test-runtime\nexport default {};");

    const fixtureWasmSha = crypto.createHash("sha256").update(fixtureWasm).digest("hex");
    const fixtureRuntimeSha = crypto.createHash("sha256").update(fixtureRuntime).digest("hex");

    const controlledConfig = {
      version: "v99.0.0-test",
      repo: "https://github.com/ERGO-Code/HiGHS.git",
      wasm: {
        path: "public/highs.wasm",
        sha256: fixtureWasmSha,
        downloadUrl: "https://github.com/ohtaman/washi/releases/download/v99.0.0-test/highs.wasm",
      },
      runtime: {
        path: "src/modeler/solvers/highs/runtime.js",
        sha256: fixtureRuntimeSha,
        downloadUrl: "https://github.com/ohtaman/washi/releases/download/v99.0.0-test/runtime.js",
      },
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === controlledConfig.wasm.downloadUrl) {
        return new Response(fixtureWasm, { status: 200, statusText: "OK" });
      }
      if (url === controlledConfig.runtime.downloadUrl) {
        return new Response(fixtureRuntime, { status: 200, statusText: "OK" });
      }
      return new Response("Not Found", { status: 404, statusText: "Not Found" });
    });

    try {
      const result = await ensureHighsAssets({
        config: controlledConfig,
        repoRoot: tmpDir,
        silent: true,
      });

      expect(result.status).toBe("downloaded");

      const downloadedWasm = path.resolve(tmpDir, controlledConfig.wasm.path);
      const downloadedRuntime = path.resolve(tmpDir, controlledConfig.runtime.path);

      expect(fs.existsSync(downloadedWasm)).toBe(true);
      expect(fs.existsSync(downloadedRuntime)).toBe(true);
      expect(fs.readFileSync(downloadedWasm)).toEqual(fixtureWasm);
      expect(fs.readFileSync(downloadedRuntime)).toEqual(fixtureRuntime);
      expect(computeSha256(downloadedWasm)).toBe(fixtureWasmSha);
      expect(computeSha256(downloadedRuntime)).toBe(fixtureRuntimeSha);
    } finally {
      fetchSpy.mockRestore();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("solves 10-node MTZ routing MIP with 72 subtour constraints without WASM memory/stack bounds errors (Issue #214)", async () => {
    const n = 10;
    const model = new Model("RoutePricing10_Issue214");

    const y: Var[] = [];
    for (let i = 1; i < n; i++) {
      y[i] = model.binary(`y_${i}`);
    }

    const x: Var[][] = [];
    for (let i = 0; i < n; i++) {
      x[i] = [];
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          x[i][j] = model.binary(`x_${i}_${j}`);
        }
      }
    }

    model.objective(maximize(sum(y.slice(1))));

    const leaveDepot = sum(Array.from({ length: n - 1 }, (_, k) => x[0][k + 1]));
    const enterDepot = sum(Array.from({ length: n - 1 }, (_, k) => x[k + 1][0]));
    model.constraint(expr`${leaveDepot} <= 1`);
    model.constraint(expr`${enterDepot} == ${leaveDepot}`);

    for (let i = 1; i < n; i++) {
      const inFlow = sum(
        Array.from({ length: n }, (_, j) => (j !== i ? x[j][i] : undefined)).filter(Boolean) as Var[]
      );
      const outFlow = sum(
        Array.from({ length: n }, (_, j) => (j !== i ? x[i][j] : undefined)).filter(Boolean) as Var[]
      );
      model.constraint(expr`${inFlow} == ${y[i]}`);
      model.constraint(expr`${outFlow} == ${y[i]}`);
    }

    const u: Var[] = [];
    for (let i = 1; i < n; i++) {
      u[i] = model.continuous(`u_${i}`, { lb: 1, ub: n - 1 });
    }
    let mtzCount = 0;
    for (let i = 1; i < n; i++) {
      for (let j = 1; j < n; j++) {
        if (i !== j) {
          model.constraint(expr`${u[i]} - ${u[j]} + ${n} * ${x[i][j]} <= ${n - 1}`);
          mtzCount++;
        }
      }
    }
    expect(mtzCount).toBe(72);

    const status = await model.solve();
    expect(status).toBe("Optimal");
    expect(model.objectiveValue).toBeCloseTo(9, 6);
    expect(model.verify().valid).toBe(true);
  });

  it("build-highs-wasm.sh fails non-zero when highs.config.json is missing or malformed without falling back to v1.15.1", () => {
    const buildScriptSrc = path.resolve(repoRoot, "scripts/build-highs-wasm.sh");

    const runBuildScriptInTempRoot = (configContent: string | null) => {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "washi-highs-build-sh-"));
      try {
        const scriptsDir = path.join(tmpRoot, "scripts");
        const stubBinDir = path.join(tmpRoot, "stub-bin");
        fs.mkdirSync(scriptsDir, { recursive: true });
        fs.mkdirSync(stubBinDir, { recursive: true });

        const emccStub = path.join(stubBinDir, "emcc");
        fs.writeFileSync(emccStub, "#!/usr/bin/env bash\necho 'emcc stub 3.1.50'\n", {
          mode: 0o755,
        });
        const gitStub = path.join(stubBinDir, "git");
        fs.writeFileSync(
          gitStub,
          "#!/usr/bin/env bash\necho \"GIT_STUB:$*\"\nexit 42\n",
          { mode: 0o755 }
        );

        const scriptCopy = path.join(scriptsDir, "build-highs-wasm.sh");
        fs.copyFileSync(buildScriptSrc, scriptCopy);
        if (configContent !== null) {
          fs.writeFileSync(path.join(tmpRoot, "highs.config.json"), configContent, "utf8");
        }
        return spawnSync("bash", [scriptCopy], {
          cwd: tmpRoot,
          env: {
            PATH: `${stubBinDir}:${process.env.PATH ?? ""}`,
            HOME: process.env.HOME ?? tmpRoot,
            HIGHS_DIR: path.join(tmpRoot, "highs-src"),
            HIGHS_BUILD_DIR: path.join(tmpRoot, "highs-build"),
          },
          encoding: "utf8",
        });
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    };

    // 1. Missing highs.config.json must fail immediately without printing v1.15.1
    const missingRes = runBuildScriptInTempRoot(null);
    expect(missingRes.status).not.toBe(0);
    expect(missingRes.stdout).not.toContain("v1.15.1");
    expect(missingRes.stderr).toContain("highs.config.json");

    // 2. Malformed JSON or missing version/repo must fail immediately without falling back to v1.15.1
    for (const badConfig of [
      "{not-valid-json",
      JSON.stringify({ repo: "https://github.com/ERGO-Code/HiGHS.git" }),
      JSON.stringify({ version: "v1.15.1" }),
      JSON.stringify({ version: "   ", repo: "https://github.com/ERGO-Code/HiGHS.git" }),
      JSON.stringify({ version: "v1.15.1", repo: "" }),
    ]) {
      const badRes = runBuildScriptInTempRoot(badConfig);
      expect(badRes.status).not.toBe(0);
      expect(badRes.stdout).not.toContain("v1.15.1");
    }

    // 3. Valid highs.config.json parses version & repo accurately before reaching isolated git stub
    const validRes = runBuildScriptInTempRoot(
      JSON.stringify({ version: "v9.8.7", repo: "https://example.com/HiGHS.git" })
    );
    expect(validRes.status).toBe(42);
    expect(validRes.stdout).toContain("Version:   v9.8.7");
    expect(validRes.stdout).toContain(
      "GIT_STUB:clone --depth 1 --branch v9.8.7 https://example.com/HiGHS.git"
    );
  });
});
