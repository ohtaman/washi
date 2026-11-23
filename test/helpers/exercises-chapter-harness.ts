import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { UI_STRINGS } from "../../examples/web-demo/exercises/src/i18n/ui-strings.js";
import { applySolverStatusToVerdict } from "../../examples/web-demo/exercises/src/problems/judge-helpers.js";
import { CHAPTERS, PROBLEMS } from "../../examples/web-demo/exercises/src/problems/registry.js";
import { runWashiExerciseCode } from "../../examples/web-demo/exercises/src/runner/washi-runner.js";
import type { ProblemDefinition, ProblemRole, RuntimeId } from "../../examples/web-demo/exercises/src/types.js";
import { parseProblemMarkdown, renderSafeMarkdown } from "../../examples/web-demo/exercises/src/ui/markdown.js";
import { killZ3Threads } from "../../src/modeler/solvers/z3.js";
import { checkScaffoldPolicy } from "./exercises-scaffold-policy.js";

export const GAMEY_COPY_RE =
  /\bBoss\b|\u30dc\u30b9|\bQuest\b|\u30af\u30a8\u30b9\u30c8|\u{1f451}|\u2605|\u2606|\u9053\u5834|\u9053\u573a|\u901a\u5173|\u5173\u5361/ui;

export const EXAMPLE_SPOILER_RE = /\bgreedy\b|\u8caa\u6b32|\u8d2a\u5fc3|\boptimal\s+\d/ui;

const hasUv = spawnSync("uv", ["--version"], { encoding: "utf-8" }).status === 0;
if (process.env.REQUIRE_HIGHSPY_PYTHON === "1" && !hasUv) {
  throw new Error("REQUIRE_HIGHSPY_PYTHON=1 is set but `uv` is not installed on PATH.");
}
const itHighspy = hasUv ? it : it.skip;

export interface HighspyJob {
  id: string;
  code: string;
  inputs: unknown[];
}

export interface HighspyBatchResult {
  ok: boolean;
  outputs?: unknown[];
  error?: string;
}

/** Convert camelCase JSON input field names to Python snake_case parameter names. */
export function toSnakeCase(name: string): string {
  return name
    .replace(/(.)([A-Z][a-z]+)/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

/** Extract parameter names from `def solve(...) -> dict:` (supports multi-line and type annotations). */
export function extractPySolveParams(source: string): string[] | null {
  const m = source.match(/^def\s+solve\s*\(([\s\S]*?)\)\s*->\s*dict(?:\[[^\]]+\])?\s*:/m);
  if (!m) return null;
  const raw = m[1].trim();
  if (!raw) return [];
  const params: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of raw) {
    if (ch === "[" || ch === "(" || ch === "{") depth++;
    else if (ch === "]" || ch === ")" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      if (cur.trim()) params.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) params.push(cur.trim());
  return params.map((p) => p.split(/[:=]/)[0].trim());
}

export function runHighspyBatch(jobs: HighspyJob[]): Record<string, HighspyBatchResult> {
  if (jobs.length === 0) return {};
  const script = `
import json, re, sys, traceback, math
try:
    import numpy as np
except Exception:
    np = None

def to_snake(name):
    s1 = re.sub(r"(.)([A-Z][a-z]+)", r"\\1_\\2", name)
    return re.sub(r"([a-z0-9])([A-Z])", r"\\1_\\2", s1).lower()

def to_camel(name):
    return re.sub(r"_([a-z0-9])", lambda m: m.group(1).upper(), name)

def to_jsonable(obj):
    if obj is None or isinstance(obj, (bool, str, int)):
        return obj
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            raise ValueError(f"Non-finite float in output: {obj}")
        return obj
    if np is not None:
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.bool_):
            return bool(obj)
        if isinstance(obj, np.ndarray):
            return [to_jsonable(v) for v in obj.tolist()]
    if isinstance(obj, dict):
        return {to_camel(str(k)): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    raise TypeError(f"Unsupported output type: {type(obj).__name__}")

jobs = json.loads(sys.stdin.read())
results = {}
for job in jobs:
    ns = {}
    try:
        exec(compile(job["code"], f"solution_{job['id']}.py", "exec"), ns)
        fn = ns.get("solve")
        if not callable(fn):
            raise RuntimeError("Missing solve() function")
        outs = [to_jsonable(fn(**{to_snake(k): v for k, v in inp.items()})) for inp in job["inputs"]]
        results[job["id"]] = {"ok": True, "outputs": outs}
    except Exception:
        results[job["id"]] = {"ok": False, "error": traceback.format_exc()}
print(json.dumps(results))
`;
  const proc = spawnSync(
    "uv",
    ["run", "--with", "pulp<4", "--with", "highspy", "python3", "-c", script],
    {
      input: JSON.stringify(jobs),
      encoding: "utf-8",
      maxBuffer: 20 * 1024 * 1024,
    }
  );
  if (proc.status !== 0) {
    throw new Error(
      `Python PuLP batch runner failed (exit ${proc.status}):\n${proc.stderr}\n${proc.stdout}`
    );
  }
  return JSON.parse(proc.stdout) as Record<string, HighspyBatchResult>;
}

export interface ChapterSuiteOptions {
  chapter: number;
  dirName: string;
  expectedIds: readonly string[];
  expectedRuntimes: Record<string, readonly RuntimeId[]>;
  usesZ3?: boolean;
  objectiveTol?: number;
  extractObjective?: (id: string, output: unknown, input: unknown) => number | null;
  checkAdversarial?: (problems: ProblemDefinition[]) => Promise<void> | void;
  timeoutMs?: number;
  /**
   * Enforce the Chapter 2+ scaffolding & hint-ladder policy (see exercises/AGENTS.md).
   * Chapter 1 keeps its onboarding-style starters and therefore does not opt in.
   */
  enforceScaffoldPolicy?: boolean;
}

export function registerChapterExerciseSuite(opts: ChapterSuiteOptions): void {
  const {
    chapter,
    dirName,
    expectedIds,
    expectedRuntimes,
    usesZ3 = false,
    objectiveTol = 1e-2,
    extractObjective,
    checkAdversarial,
    timeoutMs = 120_000,
    enforceScaffoldPolicy = false,
  } = opts;

  describe(`Exercises Chapter ${chapter} (#${expectedIds[0]}-#${expectedIds[expectedIds.length - 1]})`, () => {
    if (usesZ3) {
      afterAll(async () => {
        await killZ3Threads();
      });
    }

    if (enforceScaffoldPolicy) {
      it("follows the scaffolding & hint-ladder policy (no formula recipes in starters)", async () => {
        const errors: string[] = [];
        for (const prob of PROBLEMS.filter((p) => p.meta.chapter === chapter)) {
          const sections: Record<string, { hint1: string; hint2: string; formulation: string }> = {};
          for (const locale of ["en", "ja", "zh"] as const) {
            sections[locale] = parseProblemMarkdown(await prob.loadMarkdown(locale));
          }
          errors.push(
            ...checkScaffoldPolicy({
              id: prob.meta.id,
              chapter,
              scaffold: prob.meta.scaffold,
              washiStarter: prob.washiStarter,
              highspyStarter: prob.highspyStarter,
              sections,
            })
          );
        }
        expect(errors).toEqual([]);
      });
    }

    it("registers metadata, locales, editorials, and case schemas without spoilers or placeholders", async () => {
      const chInfo = CHAPTERS.find((c) => c.chapter === chapter);
      expect(chInfo, `Missing CHAPTERS entry for chapter ${chapter}`).toBeDefined();
      expect(chInfo!.available).toBe(true);

      const chProblems = PROBLEMS.filter((p) => p.meta.chapter === chapter);
      expect(chProblems.map((p) => p.meta.id)).toEqual([...expectedIds]);

      const validRoles: ReadonlyArray<ProblemRole> = ["intro", "core", "applied", "capstone"];
      expect(chProblems[0].meta.role).toBe("intro");
      expect(chProblems[chProblems.length - 1].meta.role).toBe("capstone");

      const problemsRoot = path.resolve(
        import.meta.dirname,
        "../../examples/web-demo/exercises/src/problems",
        dirName
      );
      const dirs = fs
        .readdirSync(problemsRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
      expect(dirs).toHaveLength(expectedIds.length);

      for (let idx = 0; idx < chProblems.length; idx++) {
        const prob = chProblems[idx];
        const expectedRt = [...(expectedRuntimes[prob.meta.id] ?? ["washi"])];
        const isDual = expectedRt.includes("highspy");

        expect(prob.meta.order).toBe(idx + 1);
        expect(validRoles).toContain(prob.meta.role);
        expect(prob.meta.runtimes).toEqual(expectedRt);
        expect(prob.meta.provenance).toEqual({
          generatedBy: "AI (Gemini)",
          autoVerified: true,
          reviewedBy: [],
        });
        expect(prob.meta.discussionNumber).toBeUndefined();
        expect(prob.cases.length).toBeGreaterThanOrEqual(5);

        expect(prob.washiStarter).toContain(`interface P${prob.meta.id}Input`);
        expect(prob.washiStarter).toContain(`interface P${prob.meta.id}Output`);
        expect(prob.washiStarter).toContain(
          `solve(input: P${prob.meta.id}Input): Promise<P${prob.meta.id}Output>`
        );
        expect(prob.washiSolution).toContain(`interface P${prob.meta.id}Output`);
        expect(prob.washiSolution).toContain(
          `solve(input: P${prob.meta.id}Input): Promise<P${prob.meta.id}Output>`
        );

        if (isDual) {
          const expectedPyParams = Object.keys(prob.cases[0].input as Record<string, unknown>).map(
            toSnakeCase
          );
          expect(prob.highspyStarter).toContain("import pulp");
          expect(extractPySolveParams(prob.highspyStarter)).toEqual(expectedPyParams);
          expect(prob.highspyStarter).toContain('"""Return {');
          expect(prob.highspySolution).toContain("import pulp");
          expect(extractPySolveParams(prob.highspySolution)).toEqual(expectedPyParams);
          expect(prob.highspySolution).toContain('"""Return {');
        } else {
          expect(prob.highspyStarter).toBe("");
          expect(prob.highspySolution).toBe("");
        }

        for (const locale of ["en", "ja", "zh"] as const) {
          expect(prob.meta.title[locale].trim().length).toBeGreaterThan(0);
          expect(prob.meta.subtitle[locale].trim().length).toBeGreaterThan(0);
          expect(prob.meta.tags[locale].length).toBeGreaterThan(0);
          expect(prob.meta.title[locale]).not.toMatch(GAMEY_COPY_RE);
          expect(prob.meta.subtitle[locale]).not.toMatch(GAMEY_COPY_RE);

          const md = await prob.loadMarkdown(locale);
          const mdCached = await prob.loadMarkdown(locale);
          expect(mdCached).toBe(md);
          expect(md).not.toMatch(GAMEY_COPY_RE);

          const sections = parseProblemMarkdown(md);
          expect(sections.title.trim().length, `${prob.meta.id} (${locale}) title`).toBeGreaterThan(0);
          expect(sections.scenario.trim().length, `${prob.meta.id} (${locale}) scenario`).toBeGreaterThan(0);
          expect(sections.scenario, `${prob.meta.id} (${locale}) scenario has fenced code`).not.toContain("```");
          expect(sections.scenario, `${prob.meta.id} (${locale}) scenario has formula/recipe`).not.toMatch(/<=|>=|==|\bsum\(|\bdot\(/);
          expect(sections.ioSpec.trim().length, `${prob.meta.id} (${locale}) ioSpec`).toBeGreaterThan(0);
          expect(renderSafeMarkdown(sections.ioSpec), `${prob.meta.id} (${locale}) ioSpec table`).toContain("<table>");
          expect(sections.example.trim().length, `${prob.meta.id} (${locale}) example`).toBeGreaterThan(0);

          const jsonBlocks = [...sections.example.matchAll(/```json\n([\s\S]*?)```/g)].map((m) =>
            JSON.parse(m[1])
          );
          expect(jsonBlocks.length, `${prob.meta.id} (${locale}) example JSON blocks`).toBeGreaterThanOrEqual(2);
          expect(jsonBlocks[0], `${prob.meta.id} (${locale}) example input`).toEqual(prob.cases[0].input);
          const exVerdict = prob.judge(
            jsonBlocks[0],
            jsonBlocks[1],
            prob.cases[0].expectedOptimal,
            locale
          );
          expect(exVerdict.ok, `${prob.meta.id} (${locale}) example verdict: ${exVerdict.message}`).toBe(true);
          expect(exVerdict.status, `${prob.meta.id} (${locale}) example status`).toBe("AC");
          expect(sections.example, `${prob.meta.id} (${locale}) example spoiler`).not.toMatch(EXAMPLE_SPOILER_RE);

          expect(prob.loadEditorial, `${prob.meta.id} missing loadEditorial`).toBeDefined();
          const ed = await prob.loadEditorial!(locale);
          const edCached = await prob.loadEditorial!(locale);
          expect(edCached).toBe(ed);
          expect(ed.trim().length, `${prob.meta.id} (${locale}) editorial`).toBeGreaterThan(0);
          expect(ed).not.toMatch(GAMEY_COPY_RE);
          expect(ed, `${prob.meta.id} (${locale}) editorial missing WaSHI label`).toContain(
            "**WaSHI (TypeScript)**"
          );
          if (isDual) {
            expect(ed, `${prob.meta.id} (${locale}) editorial missing PuLP label`).toContain(
              "**PuLP (Python)**"
            );
          } else {
            expect(ed, `${prob.meta.id} (${locale}) WaSHI-only editorial should omit PuLP`).not.toContain(
              "**PuLP (Python)**"
            );
          }
          expect(renderSafeMarkdown(ed)).toContain("?view=guide");

          for (const c of prob.cases) {
            expect(c.name[locale].trim().length).toBeGreaterThan(0);
            expect(c.name[locale]).not.toMatch(GAMEY_COPY_RE);
            expect(c.name[locale]).not.toMatch(EXAMPLE_SPOILER_RE);
          }
        }
      }
    });

    it(
      "solves every exercise via WaSHI solution.ts and rejects malformed or unimplemented starters",
      async () => {
        const chProblems = PROBLEMS.filter((p) => p.meta.chapter === chapter);
        const statusMsgs = UI_STRINGS.en.results.solverStatus;

        for (const prob of chProblems) {
          const inputs = prob.cases.map((c) => structuredClone(c.input));
          const solRun = await runWashiExerciseCode(prob.washiSolution, inputs);
          expect(solRun.error, `${prob.meta.id} WaSHI solution error: ${solRun.error}`).toBeUndefined();
          expect(solRun.ok, `${prob.meta.id} WaSHI solution run failed`).toBe(true);
          expect(solRun.outputs).toHaveLength(prob.cases.length);

          for (let i = 0; i < prob.cases.length; i++) {
            const rawVerdict = prob.judge(
              prob.cases[i].input,
              solRun.outputs[i],
              prob.cases[i].expectedOptimal,
              "en"
            );
            const verdict = applySolverStatusToVerdict(
              rawVerdict,
              solRun.metrics[i]?.solverStatus,
              statusMsgs
            );
            expect(verdict.ok, `${prob.meta.id} case[${i}]: ${verdict.message}`).toBe(true);
            expect(verdict.status, `${prob.meta.id} case[${i}]`).toBe("AC");

            if (extractObjective) {
              const obj = extractObjective(prob.meta.id, solRun.outputs[i], prob.cases[i].input);
              if (obj !== null) {
                expect(
                  Math.abs(obj - prob.cases[i].expectedOptimal),
                  `${prob.meta.id} case[${i}] expected ${prob.cases[i].expectedOptimal}, got ${obj}`
                ).toBeLessThanOrEqual(objectiveTol);
              }
            }
          }

          // Reject malformed outputs cleanly with RUNTIME_ERROR
          const emptyVerdict = prob.judge(prob.cases[0].input, {}, prob.cases[0].expectedOptimal, "ja");
          expect(emptyVerdict.ok, `${prob.meta.id} accepted empty output`).toBe(false);
          expect(emptyVerdict.status).toBe("RUNTIME_ERROR");

          const nullVerdict = prob.judge(prob.cases[0].input, null, prob.cases[0].expectedOptimal, "en");
          expect(nullVerdict.ok).toBe(false);
          expect(nullVerdict.status).toBe("RUNTIME_ERROR");

          // Starter must fail cleanly (error or non-AC verdict)
          const starterRun = await runWashiExerciseCode(prob.washiStarter, [
            structuredClone(prob.cases[0].input),
          ]);
          if (starterRun.ok) {
            const starterVerdict = applySolverStatusToVerdict(
              prob.judge(
                prob.cases[0].input,
                starterRun.outputs[0],
                prob.cases[0].expectedOptimal,
                "en"
              ),
              starterRun.metrics[0]?.solverStatus,
              statusMsgs
            );
            expect(starterVerdict.ok, `${prob.meta.id} starter unexpectedly scored AC`).toBe(false);
          }
        }

        if (checkAdversarial) {
          await checkAdversarial(chProblems);
        }
      },
      timeoutMs
    );

    itHighspy(
      "cross-verifies every dual-runtime PuLP solution.py against identical cases.json and judge()",
      () => {
        const chProblems = PROBLEMS.filter((p) => p.meta.chapter === chapter);
        const dualProblems = chProblems.filter((p) => p.meta.runtimes.includes("highspy"));
        if (dualProblems.length === 0) return;

        const batch = runHighspyBatch(
          dualProblems.map((p) => ({
            id: p.meta.id,
            code: p.highspySolution,
            inputs: p.cases.map((c) => c.input),
          }))
        );

        for (const prob of dualProblems) {
          const res = batch[prob.meta.id];
          expect(res?.ok, `${prob.meta.id} PuLP error: ${res?.error}`).toBe(true);
          expect(res.outputs).toHaveLength(prob.cases.length);

          for (let i = 0; i < prob.cases.length; i++) {
            for (const locale of ["en", "ja", "zh"] as const) {
              const verdict = prob.judge(
                prob.cases[i].input,
                res.outputs![i],
                prob.cases[i].expectedOptimal,
                locale
              );
              expect(verdict.ok, `${prob.meta.id} PuLP (${locale}) case[${i}]: ${verdict.message}`).toBe(
                true
              );
              expect(verdict.status).toBe("AC");
            }
            if (extractObjective) {
              const obj = extractObjective(prob.meta.id, res.outputs![i], prob.cases[i].input);
              if (obj !== null) {
                expect(
                  Math.abs(obj - prob.cases[i].expectedOptimal),
                  `${prob.meta.id} PuLP case[${i}] expected ${prob.cases[i].expectedOptimal}, got ${obj}`
                ).toBeLessThanOrEqual(objectiveTol);
              }
            }
          }
        }

        // Dual-runtime Python starters must raise NotImplementedError or fail judge()
        const starterBatch = runHighspyBatch(
          dualProblems.map((p) => ({
            id: p.meta.id,
            code: p.highspyStarter,
            inputs: [p.cases[0].input],
          }))
        );
        for (const prob of dualProblems) {
          const res = starterBatch[prob.meta.id];
          if (res.ok) {
            const v = prob.judge(
              prob.cases[0].input,
              res.outputs![0],
              prob.cases[0].expectedOptimal,
              "en"
            );
            expect(v.ok, `${prob.meta.id} Python starter unexpectedly scored AC`).toBe(false);
          } else {
            expect(res.error).toContain("NotImplementedError");
          }
        }
      },
      timeoutMs
    );
  });
}
