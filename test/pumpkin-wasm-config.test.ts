import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyPumpkinVersionOverride,
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
    expect(config.wasm.downloadUrl).toBe(
      `https://github.com/ohtaman/washi/releases/download/pumpkin-v${config.version}/pumpkin.wasm`
    );
    expect(config.runtime.downloadUrl).toBe(
      `https://github.com/ohtaman/washi/releases/download/pumpkin-v${config.version}/runtime.js`
    );

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

  it("reports actionable error messages when asset download fails or downloadUrls are omitted", async () => {
    const tmp = createTempWorkspace();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network connection disabled"))
    );

    const configWithUrls = {
      version: "0.5.0",
      wasm: {
        path: "public/pumpkin.wasm",
        sha256: "a".repeat(64),
        downloadUrl: "https://invalid.example.test/pumpkin.wasm",
      },
      runtime: {
        path: "src/modeler/solvers/pumpkin/runtime.js",
        sha256: "b".repeat(64),
        downloadUrl: "https://invalid.example.test/runtime.js",
      },
    };

    await expect(
      ensurePumpkinAssets({ config: configWithUrls, repoRoot: tmp, silent: true })
    ).rejects.toThrow(/Failed to download Pumpkin WebAssembly assets[\s\S]*npm run build:pumpkin-wasm/);

    const configWithoutUrls = {
      version: "0.5.0",
      wasm: {
        path: "public/pumpkin.wasm",
        sha256: "a".repeat(64),
      },
      runtime: {
        path: "src/modeler/solvers/pumpkin/runtime.js",
        sha256: "b".repeat(64),
      },
    };

    await expect(
      ensurePumpkinAssets({ config: configWithoutUrls, repoRoot: tmp, silent: true })
    ).rejects.toThrow(/No download URLs are configured\./);
  });

  it("applyPumpkinVersionOverride updates pumpkin.config.json and wasm/pumpkin/Cargo.toml consistently", () => {
    const repoRoot = process.cwd();
    const realConfig = fs.readFileSync(path.join(repoRoot, "pumpkin.config.json"), "utf-8");
    const realCargo = fs.readFileSync(path.join(repoRoot, "wasm/pumpkin/Cargo.toml"), "utf-8");

    for (const rawVersion of ["0.6.0", "v0.6.0"]) {
      const tmp = createTempWorkspace();
      const cfgPath = path.join(tmp, "pumpkin.config.json");
      const cargoPath = path.join(tmp, "wasm/pumpkin/Cargo.toml");
      fs.mkdirSync(path.dirname(cargoPath), { recursive: true });
      fs.writeFileSync(cfgPath, realConfig, "utf-8");
      fs.writeFileSync(cargoPath, realCargo, "utf-8");

      const result = applyPumpkinVersionOverride(rawVersion, {
        repoRoot: tmp,
        configPath: cfgPath,
        cargoTomlPath: cargoPath,
      });

      expect(result.version).toBe("0.6.0");
      expect(result.config.version).toBe("0.6.0");
      expect(result.config.wasm.downloadUrl).toBe(
        "https://github.com/ohtaman/washi/releases/download/pumpkin-v0.6.0/pumpkin.wasm"
      );
      expect(result.config.runtime.downloadUrl).toBe(
        "https://github.com/ohtaman/washi/releases/download/pumpkin-v0.6.0/runtime.js"
      );

      const savedCfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      expect(savedCfg.version).toBe("0.6.0");
      expect(savedCfg.wasm.downloadUrl).toBe(
        "https://github.com/ohtaman/washi/releases/download/pumpkin-v0.6.0/pumpkin.wasm"
      );
      expect(savedCfg.runtime.downloadUrl).toBe(
        "https://github.com/ohtaman/washi/releases/download/pumpkin-v0.6.0/runtime.js"
      );

      const savedCargo = fs.readFileSync(cargoPath, "utf-8");
      expect(savedCargo).toMatch(/\[package\][\s\S]*?version = "0\.6\.0"/);
      expect(savedCargo).toMatch(/^pumpkin-core = "0\.6\.0"/m);
      expect(savedCargo).toMatch(/^pumpkin-constraints = "0\.6\.0"/m);
      expect(savedCargo).toMatch(/^pumpkin-conflict-resolvers = "0\.6\.0"/m);
      expect(savedCargo).toMatch(/^pumpkin-propagators = "0\.6\.0"/m);
      expect(savedCargo).toContain('js-sys = "0.3"');
      expect(savedCargo).toContain('serde = { version = "1.0", features = ["derive"] }');
      expect(savedCargo).toContain('serde_json = "1.0"');
      expect(savedCargo).toContain('wasm-bindgen = "0.2"');
    }
  });

  it("applyPumpkinVersionOverride rejects invalid versions and missing crates without mutating files", () => {
    const repoRoot = process.cwd();
    const realConfig = fs.readFileSync(path.join(repoRoot, "pumpkin.config.json"), "utf-8");
    const realCargo = fs.readFileSync(path.join(repoRoot, "wasm/pumpkin/Cargo.toml"), "utf-8");

    for (const badVersion of ["", "latest", "0.5.0; echo pwned", "not-a-semver"]) {
      const tmp = createTempWorkspace();
      const cfgPath = path.join(tmp, "pumpkin.config.json");
      const cargoPath = path.join(tmp, "wasm/pumpkin/Cargo.toml");
      fs.mkdirSync(path.dirname(cargoPath), { recursive: true });
      fs.writeFileSync(cfgPath, realConfig, "utf-8");
      fs.writeFileSync(cargoPath, realCargo, "utf-8");

      expect(() =>
        applyPumpkinVersionOverride(badVersion, {
          repoRoot: tmp,
          configPath: cfgPath,
          cargoTomlPath: cargoPath,
        })
      ).toThrow(/Invalid Pumpkin version/);

      expect(fs.readFileSync(cfgPath, "utf-8")).toBe(realConfig);
      expect(fs.readFileSync(cargoPath, "utf-8")).toBe(realCargo);
    }

    const tmpMissingCrate = createTempWorkspace();
    const cfgPathMissing = path.join(tmpMissingCrate, "pumpkin.config.json");
    const cargoPathMissing = path.join(tmpMissingCrate, "wasm/pumpkin/Cargo.toml");
    const strippedCargo = realCargo.replace(/^pumpkin-constraints = ".*"\n/m, "");
    fs.mkdirSync(path.dirname(cargoPathMissing), { recursive: true });
    fs.writeFileSync(cfgPathMissing, realConfig, "utf-8");
    fs.writeFileSync(cargoPathMissing, strippedCargo, "utf-8");

    expect(() =>
      applyPumpkinVersionOverride("0.6.0", {
        repoRoot: tmpMissingCrate,
        configPath: cfgPathMissing,
        cargoTomlPath: cargoPathMissing,
      })
    ).toThrow(/pumpkin-constraints/);

    expect(fs.readFileSync(cfgPathMissing, "utf-8")).toBe(realConfig);
    expect(fs.readFileSync(cargoPathMissing, "utf-8")).toBe(strippedCargo);
  });

  it("aligns build-pumpkin-wasm.yml and guards publish-npm.yml for v* release tags", () => {
    const repoRoot = process.cwd();
    const buildWorkflow = fs.readFileSync(
      path.join(repoRoot, ".github/workflows/build-pumpkin-wasm.yml"),
      "utf-8"
    );

    const runLines: string[] = [];
    const wfLines = buildWorkflow.split("\n");
    for (let i = 0; i < wfLines.length; i++) {
      const m = wfLines[i].match(/^(\s*)run:\s*(.*)$/);
      if (!m) continue;
      const runIndent = m[1].length;
      runLines.push(m[2]);
      if (m[2].startsWith("|") || m[2].startsWith(">")) {
        while (i + 1 < wfLines.length) {
          const next = wfLines[i + 1];
          if (next.trim() !== "" && next.search(/\S/) <= runIndent) break;
          runLines.push(next);
          i++;
        }
      }
    }
    const runScripts = runLines.join("\n");

    expect(buildWorkflow).toContain("pumpkin_version:");
    expect(buildWorkflow).toContain("create_release:");
    expect(buildWorkflow).toContain("PUMPKIN_VERSION_OVERRIDE: ${{ inputs.pumpkin_version }}");
    expect(runScripts).not.toMatch(/\$\{\{\s*inputs\.pumpkin_version\s*\}\}/);
    expect(buildWorkflow).toContain("run: npm test");
    expect(buildWorkflow).toContain("name: pumpkin-wasm-assets");
    expect(buildWorkflow).toContain("if: github.event_name == 'workflow_dispatch' && inputs.create_release");
    expect(buildWorkflow).toContain('TAG_NAME="pumpkin-v${VERSION}"');
    expect(buildWorkflow).toContain("gh release upload");
    expect(buildWorkflow).toContain("gh release create");

    const publishWorkflow = fs.readFileSync(
      path.join(repoRoot, ".github/workflows/publish-npm.yml"),
      "utf-8"
    );
    expect(publishWorkflow).not.toMatch(/on:\s*[\s\S]*?release:\s*[\s\S]*?tags:/);
    expect(publishWorkflow).toContain("startsWith(github.event.release.tag_name, 'v')");
    expect(publishWorkflow).toMatch(
      /jobs:\s*\n\s*publish:\s*\n\s*if:.*workflow_dispatch.*startsWith\(github\.event\.release\.tag_name,\s*'v'\)/
    );
    expect(publishWorkflow).toMatch(
      /Publish to npm \(Trusted Publishing \/ OIDC\)\s*\n\s*if:.*startsWith\(github\.event\.release\.tag_name,\s*'v'\)/
    );
  });
});
