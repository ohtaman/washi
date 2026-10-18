import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import * as Washi from "../src/index.js";
import "../src/modeler/solvers/z3/index.js";
import { killZ3Threads } from "../src/modeler/solvers/z3/index.js";

interface ExtractedExample {
  file: string;
  code: string;
}

/**
 * Extracts all `@example` code blocks from JSDoc comments in a TypeScript source or `.d.ts` file.
 * Supports both fenced (` ```ts ` / ` ```typescript `) and unfenced `@example` blocks.
 */
function extractJsDocExamplesFromText(content: string, fileLabel: string): ExtractedExample[] {
  const results: ExtractedExample[] = [];
  const jsdocRegex = /\/\*\*([\s\S]*?)\*\//g;
  let docMatch: RegExpExecArray | null;

  while ((docMatch = jsdocRegex.exec(content)) !== null) {
    const rawBody = docMatch[1];
    const cleanLines = rawBody
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, ""));
    const cleanDoc = cleanLines.join("\n");

    const exampleRegex = /@example\b([\s\S]*?)(?=\n\s*@[a-zA-Z]+|$)/g;
    let exMatch: RegExpExecArray | null;
    while ((exMatch = exampleRegex.exec(cleanDoc)) !== null) {
      const section = exMatch[1].trim();
      if (!section) continue;

      const fenceRegex = /```(?:ts|typescript)?\n([\s\S]*?)```/g;
      let fenceMatch: RegExpExecArray | null;
      let foundFence = false;
      while ((fenceMatch = fenceRegex.exec(section)) !== null) {
        foundFence = true;
        const code = fenceMatch[1].trim();
        if (code.length > 0) {
          results.push({ file: fileLabel, code });
        }
      }

      if (!foundFence) {
        results.push({ file: fileLabel, code: section });
      }
    }
  }

  return results;
}

describe("Public JSDoc @example Snippets & Emitted .d.ts Declarations (Issue #102)", () => {
  const rootDir = process.cwd();
  const tscBin = path.resolve(rootDir, "node_modules/.bin/tsc");

  const modelerFiles = [
    "model.ts",
    "parser.ts",
    "expression.ts",
    "objective.ts",
    "boolean-expr.ts",
    "variable.ts",
  ];

  beforeAll(() => {
    // Ensure dist/types is freshly emitted from tsconfig.lib.json
    execFileSync(tscBin, ["-p", "tsconfig.lib.json"], {
      cwd: rootDir,
      encoding: "utf-8",
    });
  });

  it("emits enriched JSDoc comments, solver capability notes, and @example blocks into dist/types/", () => {
    const indexDtsPath = path.resolve(rootDir, "dist/types/index.d.ts");
    expect(fs.existsSync(indexDtsPath)).toBe(true);

    for (const file of modelerFiles) {
      const srcPath = path.resolve(rootDir, "src/modeler", file);
      const dtsPath = path.resolve(rootDir, "dist/types/modeler", file.replace(/\.ts$/, ".d.ts"));

      expect(fs.existsSync(dtsPath), `Expected emitted declaration file ${dtsPath} to exist`).toBe(
        true
      );

      const srcExamples = extractJsDocExamplesFromText(
        fs.readFileSync(srcPath, "utf-8"),
        `src/modeler/${file}`
      );
      const dtsExamples = extractJsDocExamplesFromText(
        fs.readFileSync(dtsPath, "utf-8"),
        `dist/types/modeler/${file.replace(/\.ts$/, ".d.ts")}`
      );

      expect(srcExamples.length).toBeGreaterThan(0);
      expect(dtsExamples).toEqual(
        srcExamples.map((e) => ({
          file: `dist/types/modeler/${file.replace(/\.ts$/, ".d.ts")}`,
          code: e.code,
        }))
      );
    }

    const modelDts = fs.readFileSync(
      path.resolve(rootDir, "dist/types/modeler/model.d.ts"),
      "utf-8"
    );
    expect(modelDts).toContain("initialValue");
    expect(modelDts).toContain("supportsWarmStart");
    expect(modelDts).toContain("unsatCore");
    expect(modelDts).toContain("validateSolution");
    expect(modelDts).toContain("toLpString");

    const parserDts = fs.readFileSync(
      path.resolve(rootDir, "dist/types/modeler/parser.d.ts"),
      "utf-8"
    );
    expect(parserDts).toContain("Quadratic terms");
    expect(parserDts).toContain("objectives only");

    const objectiveDts = fs.readFileSync(
      path.resolve(rootDir, "dist/types/modeler/objective.d.ts"),
      "utf-8"
    );
    expect(objectiveDts).toContain("objectives only");

    const booleanDts = fs.readFileSync(
      path.resolve(rootDir, "dist/types/modeler/boolean-expr.d.ts"),
      "utf-8"
    );
    expect(booleanDts).toContain("Z3");
  });

  it("extracts and type-checks all JSDoc @example blocks against emitted dist/types/ declarations with tsc --noEmit", () => {
    const allDtsExamples: ExtractedExample[] = [];
    for (const file of modelerFiles) {
      const dtsRel = `dist/types/modeler/${file.replace(/\.ts$/, ".d.ts")}`;
      const dtsPath = path.resolve(rootDir, dtsRel);
      const examples = extractJsDocExamplesFromText(fs.readFileSync(dtsPath, "utf-8"), dtsRel);
      allDtsExamples.push(...examples);
    }

    // Core public exports across model, parser, expression, objective, boolean-expr, and variable
    expect(allDtsExamples.length).toBeGreaterThanOrEqual(24);

    const tmpDir = path.resolve(rootDir, `test/.tmp-jsdoc-examples-${process.pid}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const defaultWashiImport = [
      `import {`,
      `  Model,`,
      `  Var,`,
      `  BoolVar,`,
      `  BoolExpr,`,
      `  BoolOp,`,
      `  LinExpr,`,
      `  QuadExpr,`,
      `  Constraint,`,
      `  expr,`,
      `  sum,`,
      `  dot,`,
      `  maximize,`,
      `  minimize,`,
      `  and,`,
      `  or,`,
      `  not,`,
      `  implies,`,
      `  xor,`,
      `} from "@ohtaman/washi";`,
    ].join("\n");

    try {
      allDtsExamples.forEach((ex, idx) => {
        const hasNamedWashiImport = /import\s+\{[\s\S]*?\}\s+from\s+["']@ohtaman\/washi["']/.test(
          ex.code
        );
        const moduleSource = [
          `// Source: ${ex.file} (#${idx + 1})`,
          ...(hasNamedWashiImport ? [] : [defaultWashiImport]),
          ex.code,
          `export {};`,
        ].join("\n\n");
        fs.writeFileSync(path.join(tmpDir, `example-${idx + 1}.ts`), moduleSource, "utf-8");
      });

      const tmpTsconfigPath = path.join(tmpDir, "tsconfig.json");
      fs.writeFileSync(
        tmpTsconfigPath,
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            lib: ["ES2022", "DOM", "DOM.Iterable"],
            strict: true,
            noEmit: true,
            skipLibCheck: false,
            types: ["node"],
            paths: {
              "@ohtaman/washi": ["../../dist/types/index.d.ts"],
              "@ohtaman/washi/solvers/z3": ["../../dist/types/modeler/solvers/z3/index.d.ts"],
              "@ohtaman/washi/solvers/glpk": ["../../dist/types/modeler/solvers/glpk/index.d.ts"],
            },
          },
          include: ["./*.ts"],
        }),
        "utf-8"
      );

      try {
        execFileSync(tscBin, ["-p", tmpTsconfigPath, "--noEmit"], {
          cwd: rootDir,
          encoding: "utf-8",
        });
      } catch (err: any) {
        throw new Error(
          `tsc --noEmit failed on JSDoc @example blocks:\n${err.stdout || err.stderr || err.message}`
        );
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("executes all JSDoc @example blocks at runtime and verifies expected model outcomes", async () => {
    const allExamples: ExtractedExample[] = [];
    for (const file of modelerFiles) {
      const srcRel = `src/modeler/${file}`;
      const srcPath = path.resolve(rootDir, srcRel);
      allExamples.push(...extractJsDocExamplesFromText(fs.readFileSync(srcPath, "utf-8"), srcRel));
    }

    expect(allExamples.length).toBeGreaterThanOrEqual(24);

    const createdModels: Washi.Model[] = [];
    class TrackedModel extends Washi.Model {
      constructor(...args: ConstructorParameters<typeof Washi.Model>) {
        super(...args);
        createdModels.push(this);
      }
    }

    try {
      for (const ex of allExamples) {
        const jsBody = stripTypeScriptTypes(ex.code).replace(/^\s*import\s+[\s\S]*?;\s*$/gm, "");
        const runner = new Function(
          "Model",
          "Var",
          "BoolVar",
          "LinExpr",
          "QuadExpr",
          "Constraint",
          "expr",
          "sum",
          "dot",
          "maximize",
          "minimize",
          "and",
          "or",
          "not",
          "implies",
          "xor",
          `return (async () => {\n${jsBody}\n})();`
        );
        await runner(
          TrackedModel,
          Washi.Var,
          Washi.BoolVar,
          Washi.LinExpr,
          Washi.QuadExpr,
          Washi.Constraint,
          Washi.expr,
          Washi.sum,
          Washi.dot,
          Washi.maximize,
          Washi.minimize,
          Washi.and,
          Washi.or,
          Washi.not,
          Washi.implies,
          Washi.xor
        );
      }

      const byName = new Map(createdModels.map((m) => [m.name, m]));

      // Verify independent mathematical expectations for solved / checked example models
      const prodPlan = byName.get("ProductionPlan");
      expect(prodPlan).toBeDefined();
      expect(prodPlan!.status).toBe("Optimal");
      expect(prodPlan!.objectiveValue).toBeCloseTo(1080, 6);
      expect(prodPlan!.validateSolution().valid).toBe(true);

      const getValuesModel = byName.get("GetValuesExample");
      expect(getValuesModel).toBeDefined();
      expect(getValuesModel!.status).toBe("Optimal");
      expect(getValuesModel!.objectiveValue).toBeCloseTo(500, 6);

      const solveModel = byName.get("SolveExample");
      expect(solveModel).toBeDefined();
      expect(solveModel!.status).toBe("Optimal");
      expect(solveModel!.objectiveValue).toBeCloseTo(1200, 6);
      expect(solveModel!.validateSolution().valid).toBe(true);

      const linearCheck = byName.get("LinearCheck");
      expect(linearCheck).toBeDefined();
      expect(linearCheck!.status).toBe("Sat");
      expect(linearCheck!.hasPrimalSolution).toBe(true);
      expect(linearCheck!.getVarByName("x")?.value).toBeGreaterThanOrEqual(4 - 1e-6);

      const policyCheck = byName.get("PolicyCheck");
      expect(policyCheck).toBeDefined();
      expect(policyCheck!.status).toBe("Unsat");
      expect(policyCheck!.conflicts).toEqual(expect.arrayContaining(["is_vip", "vip_min", "cap"]));
      expect(policyCheck!.unsatCore).toEqual(policyCheck!.conflicts);

      const validateModel = byName.get("ValidateExample");
      expect(validateModel).toBeDefined();
      expect(validateModel!.status).toBe("Optimal");
      expect(validateModel!.objectiveValue).toBeCloseTo(21, 6);
      expect(validateModel!.getVarByName("x")?.value).toBeCloseTo(7, 6);
      expect(validateModel!.validateSolution().valid).toBe(true);
    } finally {
      await killZ3Threads();
    }
  });
});
