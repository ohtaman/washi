import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkAssetsMatch,
  computeSha256,
  ensurePumpkinAssets,
  loadConfig,
  updateHashes,
} from "../scripts/ensure-pumpkin-wasm.mjs";

const tempDirs: string[] = [];

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "washi-pumpkin-config-"));
  tempDirs.push(dir);
  return dir;
}

describe("Pumpkin WASM Config & Asset Verification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads pumpkin.config.json and confirms checked-in WASM/runtime match recorded SHA-256 hashes", () => {
    const config = loadConfig();
    expect(config.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(config.wasm.path).toBe("public/pumpkin.wasm");
    expect(config.runtime.path).toBe("src/modeler/solvers/pumpkin/runtime.js");
    expect(config.wasm.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(config.runtime.sha256).toMatch(/^[0-9a-f]{64}$/);

    const match = checkAssetsMatch(config);
    expect(match).toEqual({ valid: true });
  });

  it("validates pumpkin.config.json structure against scripts/pumpkin-config.schema.json", () => {
    const schemaPath = path.resolve(process.cwd(), "scripts/pumpkin-config.schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    const config = loadConfig();

    for (const key of schema.required as string[]) {
      expect(config[key]).toBeDefined();
    }
    expect(typeof config.version).toBe("string");
    expect(typeof config.crate).toBe("string");
    expect(typeof config.repo).toBe("string");
    expect(typeof config.wasm.path).toBe("string");
    expect(typeof config.runtime.path).toBe("string");
  });

  it("detects missing files, SHA-256 mismatches, and updates hashes cleanly", () => {
    const tmp = createTempWorkspace();
    const wasmRel = "public/pumpkin.wasm";
    const runtimeRel = "src/modeler/solvers/pumpkin/runtime.js";
    const configPath = path.join(tmp, "pumpkin.config.json");

    fs.mkdirSync(path.dirname(path.join(tmp, wasmRel)), { recursive: true });
    fs.mkdirSync(path.dirname(path.join(tmp, runtimeRel)), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          version: "0.5.0",
          wasm: { path: wasmRel, sha256: "0".repeat(64), downloadUrl: "" },
          runtime: { path: runtimeRel, sha256: "0".repeat(64), downloadUrl: "" },
        },
        null,
        2
      )
    );

    const cfg1 = loadConfig(configPath);
    expect(checkAssetsMatch(cfg1, tmp)).toMatchObject({ valid: false, reason: "missing_wasm" });

    fs.writeFileSync(path.join(tmp, wasmRel), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
    expect(checkAssetsMatch(cfg1, tmp)).toMatchObject({ valid: false, reason: "missing_runtime" });

    fs.writeFileSync(path.join(tmp, runtimeRel), "export function check_json() {}\n");
    expect(checkAssetsMatch(cfg1, tmp)).toMatchObject({ valid: false, reason: "sha_mismatch_wasm" });

    const updated = updateHashes(configPath, tmp);
    expect(updated.wasm.sha256).toBe(computeSha256(path.join(tmp, wasmRel)));
    expect(updated.runtime.sha256).toBe(computeSha256(path.join(tmp, runtimeRel)));
    expect(checkAssetsMatch(updated, tmp)).toEqual({ valid: true });
  });

  it("downloads and verifies assets when downloadUrl is configured, and fails explicitly on corrupted download", async () => {
    const tmp = createTempWorkspace();
    const wasmBytes = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    const runtimeText = "export default async function init() {}\n";
    const wasmSha = crypto.createHash("sha256").update(wasmBytes).digest("hex");
    const runtimeSha = crypto.createHash("sha256").update(runtimeText).digest("hex");

    const config = {
      version: "0.5.0",
      wasm: {
        path: "public/pumpkin.wasm",
        sha256: wasmSha,
        downloadUrl: "https://example.test/pumpkin.wasm",
      },
      runtime: {
        path: "src/modeler/solvers/pumpkin/runtime.js",
        sha256: runtimeSha,
        downloadUrl: "https://example.test/runtime.js",
      },
    };

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("pumpkin.wasm")) {
        return new Response(wasmBytes, { status: 200 });
      }
      if (url.endsWith("runtime.js")) {
        return new Response(runtimeText, { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const downloaded = await ensurePumpkinAssets({ config, repoRoot: tmp, silent: true });
    expect(downloaded.status).toBe("downloaded");
    expect(checkAssetsMatch(config, tmp)).toEqual({ valid: true });

    const cached = await ensurePumpkinAssets({ config, repoRoot: tmp, silent: true });
    expect(cached.status).toBe("cached");

    // Corrupt download should throw SHA-256 mismatch error
    const tmpBad = createTempWorkspace();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(Buffer.from("corrupted"), { status: 200 }))
    );
    await expect(
      ensurePumpkinAssets({ config, repoRoot: tmpBad, silent: true })
    ).rejects.toThrow(/SHA-256 mismatch/);
  });
});
