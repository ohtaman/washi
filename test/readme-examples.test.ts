import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { describe, it, expect } from "vitest";
import * as Washi from "../src/index.js";

function extractTsBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const regex = /```(?:ts|typescript)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const code = match[1].trim();
    if (code.length > 0) {
      blocks.push(code);
    }
  }
  return blocks;
}

function rewriteSnippetImports(jsCode: string): string {
  return jsCode
    .replace(
      /^\s*import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']\s*;?\s*$/gm,
      (_full, rawBindings: string, specifier: string) => {
        const names = rawBindings
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part.length > 0);
        const bindings = names.map((part) => {
          const asMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(part);
          return asMatch
            ? { imported: asMatch[1], local: asMatch[2] }
            : { imported: part, local: part };
        });
        const destructured = bindings
          .map(({ imported, local }) => (imported === local ? imported : `${imported}: ${local}`))
          .join(", ");
        const importedList = JSON.stringify(bindings.map((b) => b.imported));
        return `const { ${destructured} } = await __importNamed(${JSON.stringify(specifier)}, ${importedList});`;
      }
    )
    .replace(
      /^\s*import\s*["']([^"']+)["']\s*;?\s*$/gm,
      (_full, specifier: string) => `await __importNamed(${JSON.stringify(specifier)}, []);`
    );
}

describe("README.md Code Snippets & Links Validation", () => {
  const readmeSpecs = [
    {
      file: "README.md",
      docsUrl: "https://washi.ohtaman.dev/",
      crossOriginUrl: "https://washi.ohtaman.dev/getting-started/cross-origin",
      crossOriginDocPath: "docs/getting-started/cross-origin.md",
    },
    {
      file: "README-ja.md",
      docsUrl: "https://washi.ohtaman.dev/ja/",
      crossOriginUrl: "https://washi.ohtaman.dev/ja/getting-started/cross-origin",
      crossOriginDocPath: "docs/ja/getting-started/cross-origin.md",
    },
    {
      file: "README-zh-CN.md",
      docsUrl: "https://washi.ohtaman.dev/zh/",
      crossOriginUrl: "https://washi.ohtaman.dev/zh/getting-started/cross-origin",
      crossOriginDocPath: "docs/zh/getting-started/cross-origin.md",
    },
  ];

  it("extracts and executes all fenced TypeScript snippets from README.md, README-ja.md, and README-zh-CN.md", async () => {
    for (const { file } of readmeSpecs) {
      const content = fs.readFileSync(path.resolve(process.cwd(), file), "utf-8");
      const blocks = extractTsBlocks(content);
      expect(blocks, `Expected 5 TypeScript snippets in ${file}`).toHaveLength(5);

      const createdModels: Washi.Model[] = [];
      const logs: string[] = [];

      class TrackedModel extends Washi.Model {
        constructor(...args: ConstructorParameters<typeof Washi.Model>) {
          super(...args);
          createdModels.push(this);
        }
      }

      const silentConsole = {
        ...console,
        log: (...args: unknown[]) => {
          logs.push(args.map(String).join(" "));
        },
      };

      const importNamed = async (
        specifier: string,
        names: string[]
      ): Promise<Record<string, unknown>> => {
        let mod: Record<string, unknown>;
        if (specifier === "@ohtaman/washi") {
          mod = { ...Washi, Model: TrackedModel };
        } else if (specifier === "@ohtaman/washi/solvers/highs") {
          mod = await import("../src/modeler/solvers/highs.js");
        } else if (specifier === "@ohtaman/washi/solvers/pumpkin") {
          mod = await import("../src/modeler/solvers/pumpkin.js");
        } else if (specifier === "@ohtaman/washi/solvers/z3") {
          mod = await import("../src/modeler/solvers/z3.js");
        } else if (specifier === "@ohtaman/washi/solvers/glpk") {
          mod = await import("../src/modeler/solvers/glpk.js");
        } else {
          throw new Error(`Unexpected module specifier in README snippet: ${specifier}`);
        }
        for (const name of names) {
          if (!(name in mod) || mod[name] === undefined) {
            throw new Error(`Export "${name}" does not exist on module "${specifier}"`);
          }
        }
        return mod;
      };

      for (let i = 0; i < blocks.length; i++) {
        const jsBody = rewriteSnippetImports(stripTypeScriptTypes(blocks[i]));
        expect(jsBody, `Unresolved import syntax in ${file} block #${i + 1}`).not.toMatch(
          /^\s*import\b/m
        );
        const runner = new Function(
          "__importNamed",
          "console",
          `return (async () => {\n${jsBody}\n})();`
        );
        await runner(importNamed, silentConsole);
      }

      expect(createdModels).toHaveLength(5);
      expect(logs.length).toBeGreaterThanOrEqual(5);

      // 1. Quick Start: Woodworking MIP (30*x + 50*y, x + 2y <= 40, 2x + y <= 50) -> Optimal 1100, (20, 10)
      const [mQuick, mTransport, mPortfolio, mWorkshop, mStaffing] = createdModels;
      expect(mQuick.status).toBe("Optimal");
      expect(mQuick.objectiveValue).toBe(1100);
      expect([...mQuick.variables.values()].map((v) => v.value)).toEqual([20, 10]);
      expect(mQuick.verify().valid).toBe(true);

      // 2. TransportPlanning: Tokyo -> StoreA = 100, min cost = 400
      expect(mTransport.status).toBe("Optimal");
      expect(mTransport.objectiveValue).toBeCloseTo(400, 6);
      expect(mTransport.verify().valid).toBe(true);

      // 3. PortfolioQP: min 0.04*x^2 + 0.005*y^2 s.t. x+y=1, 0.14x+0.04y>=0.08 -> (0.4, 0.6), obj 0.0082
      expect(mPortfolio.status).toBe("Optimal");
      expect(mPortfolio.variables.get("tech")?.value).toBeCloseTo(0.4, 5);
      expect(mPortfolio.variables.get("bonds")?.value).toBeCloseTo(0.6, 5);
      expect(mPortfolio.objectiveValue).toBeCloseTo(0.0082, 6);
      expect(mPortfolio.verify().valid).toBe(true);

      // 4. WorkshopCP (Pumpkin): cut=0, weld=4, paint=7, makespan=9, 3 distinct benches
      expect(mWorkshop.status).toBe("Optimal");
      expect(mWorkshop.objectiveValue).toBe(9);
      expect(mWorkshop.variables.get("start_cut")?.value).toBe(0);
      expect(mWorkshop.variables.get("start_weld")?.value).toBe(4);
      expect(mWorkshop.variables.get("start_paint")?.value).toBe(7);
      expect(
        new Set([
          mWorkshop.variables.get("bench_cut")?.value,
          mWorkshop.variables.get("bench_weld")?.value,
          mWorkshop.variables.get("bench_paint")?.value,
        ])
      ).toEqual(new Set([1, 2, 3]));
      expect(mWorkshop.verify().valid).toBe(true);

      // 5. StaffingRules: Infeasible conflict diagnosis -> Unsat, ["rush_required"]
      expect(mStaffing.status).toBe("Unsat");
      expect(mStaffing.conflicts).toEqual(["rush_required"]);
    }
  });

  it("uses npm-safe absolute URLs for images, docs, and repo links across README.md, README-ja.md, and README-zh-CN.md", () => {
    const githubBlobPrefix = "https://github.com/ohtaman/washi/blob/main/";
    const expectedRepoTargets = [
      "README.md",
      "README-ja.md",
      "README-zh-CN.md",
      "LICENSE",
      "THIRD_PARTY_LICENSES.md",
      "CONTRIBUTING.md",
      "examples/README.md",
      "examples/distribution/README.md",
      "skills/washi/SKILL.md",
    ];

    expect(
      fs.existsSync(path.resolve(process.cwd(), "docs/public/washi-header-dark.png"))
    ).toBe(true);
    expect(
      fs.existsSync(path.resolve(process.cwd(), "docs/public/washi-header-light.png"))
    ).toBe(true);

    for (const { file, docsUrl, crossOriginUrl, crossOriginDocPath } of readmeSpecs) {
      const content = fs.readFileSync(path.resolve(process.cwd(), file), "utf-8");
      const proseWithoutCodeBlocks = content.replace(/```[\s\S]*?```/g, "");

      expect(content).toContain(`](${docsUrl})`);
      expect(content).toContain(`](${crossOriginUrl})`);
      expect(
        fs.existsSync(path.resolve(process.cwd(), crossOriginDocPath)),
        `Expected doc source '${crossOriginDocPath}' for ${file} to exist`
      ).toBe(true);

      expect(proseWithoutCodeBlocks).toContain("https://washi.ohtaman.dev/washi-header-dark.png");
      expect(proseWithoutCodeBlocks).toContain("https://washi.ohtaman.dev/washi-header-light.png");
      expect(proseWithoutCodeBlocks).not.toContain("./assets/");

      const mdTargets = [...proseWithoutCodeBlocks.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
      const htmlTargets = [
        ...proseWithoutCodeBlocks.matchAll(/\b(?:href|src|srcset)=["']([^"']+)["']/g),
      ].map((m) => m[1]);
      const allTargets = [...mdTargets, ...htmlTargets];
      expect(allTargets.length).toBeGreaterThan(0);

      for (const target of allTargets) {
        expect(target, `Non-HTTPS target '${target}' in ${file}`).toMatch(/^https:\/\//);
      }

      const repoTargets = new Set(
        allTargets
          .filter((target) => target.startsWith(githubBlobPrefix))
          .map((target) => target.slice(githubBlobPrefix.length).split("#")[0])
      );
      expect(repoTargets.size).toBeGreaterThanOrEqual(8);
      for (const expectedTarget of expectedRepoTargets) {
        expect(
          repoTargets.has(expectedTarget),
          `Expected GitHub blob link to '${expectedTarget}' in ${file}`
        ).toBe(true);
      }
      for (const relPath of repoTargets) {
        const absPath = path.resolve(process.cwd(), relPath);
        expect(
          fs.existsSync(absPath),
          `Expected linked repo path '${relPath}' in ${file} to exist`
        ).toBe(true);
      }
    }
  });

  it("ships only the canonical English README.md in package.json and npm pack tarball", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")
    ) as { files: string[] };

    expect(pkg.files).toContain("README.md");
    expect(
      pkg.files.filter((entry) => /^readme[.-].+\.md$/i.test(entry)),
      "Localized README entries must not be listed in package.json files"
    ).toEqual([]);

    const rootDotReadmes = fs
      .readdirSync(process.cwd())
      .filter((entry) => /^readme(?:\..+)?$/i.test(entry));
    expect(
      rootDotReadmes,
      "Only README.md may match README.* at the repository root so npm does not auto-pack/select localized READMEs"
    ).toEqual(["README.md"]);

    const packJson = execFileSync(
      "npm",
      ["pack", "--dry-run", "--ignore-scripts", "--json"],
      { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const packResult = JSON.parse(packJson) as Array<{ files: Array<{ path: string }> }>;
    const packedPaths = packResult[0].files.map((entry) => entry.path);
    const packedRootReadmes = packedPaths.filter(
      (entry) => !entry.includes("/") && /^readme(?:[.-].*)?$/i.test(entry)
    );
    expect(packedRootReadmes).toEqual(["README.md"]);
  });
});
