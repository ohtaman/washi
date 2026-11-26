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
    { file: "README.md", docsUrl: "https://washi.ohtaman.dev/" },
    { file: "README.ja.md", docsUrl: "https://washi.ohtaman.dev/ja/" },
    { file: "README.zh-CN.md", docsUrl: "https://washi.ohtaman.dev/zh/" },
  ];

  it("extracts and executes all fenced TypeScript snippets from README.md, README.ja.md, and README.zh-CN.md", async () => {
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

  it("links to the online documentation and valid relative docs/ files across README.md, README.ja.md, and README.zh-CN.md", () => {
    for (const { file, docsUrl } of readmeSpecs) {
      const content = fs.readFileSync(path.resolve(process.cwd(), file), "utf-8");
      expect(content).toContain(`](${docsUrl})`);

      const relativeDocRegex = /\]\((docs\/[^)#\s]+)\)/g;
      let match: RegExpExecArray | null;
      const matchedPaths: string[] = [];
      while ((match = relativeDocRegex.exec(content)) !== null) {
        const relPath = match[1];
        matchedPaths.push(relPath);
        const absPath = path.resolve(process.cwd(), relPath);
        expect(
          fs.existsSync(absPath),
          `Expected relative doc path '${relPath}' in ${file} to exist`
        ).toBe(true);
      }
      expect(matchedPaths.length).toBeGreaterThanOrEqual(1);
    }
  });
});
