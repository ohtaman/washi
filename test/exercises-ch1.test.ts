import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { UI_STRINGS } from "../examples/web-demo/exercises/src/i18n/ui-strings.js";
import { applySolverStatusToVerdict } from "../examples/web-demo/exercises/src/problems/judge-helpers.js";
import { parseProblemMarkdown, renderSafeMarkdown } from "../examples/web-demo/exercises/src/ui/markdown.js";
import { runWashiExerciseCode } from "../examples/web-demo/exercises/src/runner/washi-runner.js";
import { CHAPTERS, PROBLEMS } from "../examples/web-demo/exercises/src/problems/registry.js";

const GAMEY_COPY_RE =
  /\bBoss\b|\u30dc\u30b9|\u{1f451}|\u30af\u30a8\u30b9\u30c8|\u6483\u7834|\u901a\u5173|\u5173\u5361|\u9053\u5834|\u9053\u573a|\u6311\u6226/ui;

const EXPECTED_IDS = [
  "000",
  "001",
  "002",
  "003",
  "004",
  "005",
  "006",
  "007",
  "008",
  "009",
  "010",
];

const hasUv = spawnSync("uv", ["--version"], { encoding: "utf-8" }).status === 0;
if (process.env.REQUIRE_HIGHSPY_PYTHON === "1" && !hasUv) {
  throw new Error("REQUIRE_HIGHSPY_PYTHON=1 is set but `uv` is not installed on PATH.");
}
const itHighspy = hasUv ? it : it.skip;

function runHighspyBatch(
  jobs: Array<{ id: string; code: string; inputs: unknown[] }>
): Record<string, { ok: boolean; outputs?: unknown[]; error?: string }> {
  const script = `
import json, sys, traceback, math
try:
    import numpy as np
except Exception:
    np = None

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
        return {str(k): to_jsonable(v) for k, v in obj.items()}
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
            raise RuntimeError("Missing solve(input_data) function")
        outs = [to_jsonable(fn(inp)) for inp in job["inputs"]]
        results[job["id"]] = {"ok": True, "outputs": outs}
    except Exception:
        results[job["id"]] = {"ok": False, "error": traceback.format_exc()}
print(json.dumps(results))
`;
  const proc = spawnSync("uv", ["run", "--with", "highspy", "python3", "-c", script], {
    input: JSON.stringify(jobs),
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (proc.status !== 0) {
    throw new Error(`Python highspy batch runner failed (exit ${proc.status}):\n${proc.stderr}\n${proc.stdout}`);
  }
  return JSON.parse(proc.stdout);
}

describe("Exercises Phase 1 — Chapter 1 (#001-#010)", () => {
  it("registers all 10 chapters in the roadmap and all 10 Chapter 1 problems with complete metadata", async () => {
    expect(CHAPTERS.map((c) => c.chapter)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const ch of CHAPTERS) {
      expect(ch.title.en.trim().length).toBeGreaterThan(0);
      expect(ch.title.ja.trim().length).toBeGreaterThan(0);
      expect(ch.title.zh.trim().length).toBeGreaterThan(0);
      expect(ch.description.en.trim().length).toBeGreaterThan(0);
      expect(ch.description.ja.trim().length).toBeGreaterThan(0);
      expect(ch.description.zh.trim().length).toBeGreaterThan(0);
    }

    expect(PROBLEMS.map((p) => p.meta.id)).toEqual(EXPECTED_IDS);

    for (const prob of PROBLEMS) {
      const isTutorial = prob.meta.id === "000";
      if (isTutorial) {
        expect(prob.meta.chapter).toBe(0);
        expect(prob.meta.role).toBe("tutorial");
      } else {
        expect(prob.meta.chapter).toBe(1);
        expect(["intro", "core", "applied", "capstone"]).toContain(prob.meta.role);
        expect(prob.washiStarter).toContain("import ");
        expect(prob.washiStarter).toContain("new Model(");
        expect(prob.highspyStarter).toContain("import highspy");
        expect(prob.highspyStarter).toContain("highspy.Highs()");
      }
      expect(prob.washiStarter).not.toContain("ReducedCostBoss");
      expect(prob.washiSolution).not.toContain("ReducedCostBoss");
      expect(prob.washiStarter).toContain(`interface P${prob.meta.id}Input`);
      expect(prob.washiStarter).toContain(`interface P${prob.meta.id}Output`);
      expect(prob.washiStarter).toContain(`solve(input: P${prob.meta.id}Input): Promise<P${prob.meta.id}Output>`);
      expect(prob.washiSolution).toContain(`interface P${prob.meta.id}Output`);
      expect(prob.washiSolution).toContain(`solve(input: P${prob.meta.id}Input): Promise<P${prob.meta.id}Output>`);
      expect(prob.highspyStarter).toContain("def solve(input_data: dict) -> dict:");
      expect(prob.highspyStarter).toContain('"""Return {');
      expect(prob.highspySolution).toContain('"""Return {');
      expect(prob.meta.runtimes).toEqual(["washi", "highspy"]);
      expect(prob.meta.provenance.generatedBy).toBe("AI (Gemini)");
      expect(prob.meta.provenance.autoVerified).toBe(true);
      expect(prob.meta.provenance.reviewedBy).toEqual([]);
      expect(prob.cases.length).toBeGreaterThanOrEqual(2);

      for (const locale of ["en", "ja", "zh"] as const) {
        expect(prob.meta.title[locale].trim().length).toBeGreaterThan(0);
        expect(prob.meta.subtitle[locale].trim().length).toBeGreaterThan(0);
        expect(prob.meta.tags[locale].length).toBeGreaterThan(0);
        expect(prob.meta.title[locale]).not.toMatch(GAMEY_COPY_RE);
        expect(prob.meta.subtitle[locale]).not.toMatch(GAMEY_COPY_RE);
        expect(prob.meta.tags[locale].join(" ")).not.toMatch(GAMEY_COPY_RE);

        const md = await prob.loadMarkdown(locale);
        const mdCached = await prob.loadMarkdown(locale);
        expect(mdCached).toBe(md);
        expect(md).not.toMatch(GAMEY_COPY_RE);

        const sections = parseProblemMarkdown(md);
        expect(sections.title.trim().length, `${prob.meta.id} (${locale}) title`).toBeGreaterThan(0);
        expect(sections.scenario.trim().length, `${prob.meta.id} (${locale}) scenario`).toBeGreaterThan(0);
        expect(sections.scenario, `${prob.meta.id} (${locale}) scenario has backticks`).not.toContain("`");
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

        expect(prob.loadEditorial, `${prob.meta.id} missing loadEditorial`).toBeDefined();
        const ed = await prob.loadEditorial!(locale);
        const edCached = await prob.loadEditorial!(locale);
        expect(edCached).toBe(ed);
        expect(ed.trim().length, `${prob.meta.id} (${locale}) editorial`).toBeGreaterThan(0);
        expect(ed).not.toMatch(GAMEY_COPY_RE);
        expect(ed, `${prob.meta.id} (${locale}) editorial missing TypeScript label`).toContain("TypeScript");
        expect(ed, `${prob.meta.id} (${locale}) editorial missing Python label`).toContain("Python");
        expect(renderSafeMarkdown(ed)).toContain("?view=guide");
        expect(sections.hint1.trim().length, `${prob.meta.id} (${locale}) unexpected problem-tab hint1`).toBe(0);
        expect(sections.hint2.trim().length, `${prob.meta.id} (${locale}) unexpected problem-tab hint2`).toBe(0);
        expect(sections.formulation.trim().length, `${prob.meta.id} (${locale}) unexpected problem-tab formulation`).toBe(0);

        for (const c of prob.cases) {
          expect(c.name[locale].trim().length).toBeGreaterThan(0);
          expect(c.name[locale]).not.toMatch(GAMEY_COPY_RE);
        }
      }
    }

    // Verify localized judge strings in JSON and standalone Markdown files (30 files) cleanly
    const problemsRoot = path.resolve(import.meta.dirname, "../examples/web-demo/exercises/src/problems");
    const ch1Dirs = fs
      .readdirSync(path.join(problemsRoot, "ch01-modeling-basics"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect(ch1Dirs).toHaveLength(10);
    for (const dir of ch1Dirs) {
      for (const lang of ["en", "ja", "zh"] as const) {
        const mdPath = path.join(problemsRoot, "ch01-modeling-basics", dir, "locales", `${lang}.md`);
        const jsonPath = path.join(problemsRoot, "ch01-modeling-basics", dir, "locales", `${lang}.json`);
        expect(fs.existsSync(mdPath), `Missing ${mdPath}`).toBe(true);
        const mdText = fs.readFileSync(mdPath, "utf-8");
        expect(mdText.trim().length, `Empty ${mdPath}`).toBeGreaterThan(0);
        expect(mdText, mdPath).not.toMatch(GAMEY_COPY_RE);

        const jsonText = fs.readFileSync(jsonPath, "utf-8");
        expect(jsonText, jsonPath).not.toMatch(GAMEY_COPY_RE);
        const parsedJson = JSON.parse(jsonText) as Record<string, unknown>;
        expect("markdown" in parsedJson, `Unexpected markdown field in ${jsonPath}`).toBe(false);
      }
    }
  });

  it("solves every problem via WaSHI solution.ts across all test cases and catches starter/broken solutions honestly", async () => {
    for (const prob of PROBLEMS) {
      const inputs = prob.cases.map((c) => structuredClone(c.input));
      const solRun = await runWashiExerciseCode(prob.washiSolution, inputs);
      expect(solRun.error, `${prob.meta.id} solution error: ${solRun.error}`).toBeUndefined();
      expect(solRun.ok, `${prob.meta.id} solution failed`).toBe(true);
      expect(solRun.outputs).toHaveLength(prob.cases.length);

      for (let i = 0; i < prob.cases.length; i++) {
        const verdict = prob.judge(
          prob.cases[i].input,
          solRun.outputs[i],
          prob.cases[i].expectedOptimal,
          "en"
        );
        expect(verdict.ok, `${prob.meta.id} case[${i}]: ${verdict.message}`).toBe(true);
        expect(verdict.status, `${prob.meta.id} case[${i}]`).toBe("AC");
      }

      // Malformed / invalid empty object output must be classified as RUNTIME_ERROR, not VIOLAITON
      const badVerdict = prob.judge(prob.cases[0].input, {}, prob.cases[0].expectedOptimal, "ja");
      expect(badVerdict.ok, `${prob.meta.id} accepted empty output`).toBe(false);
      expect(badVerdict.status).toBe("RUNTIME_ERROR");

      // Non-object / NaN outputs must also report RUNTIME_ERROR instead of constraint VIOLATION
      const nullVerdict = prob.judge(prob.cases[0].input, null, prob.cases[0].expectedOptimal, "en");
      expect(nullVerdict.ok).toBe(false);
      expect(nullVerdict.status).toBe("RUNTIME_ERROR");

      // #010 (Production line activation) must reject exceeding capacity when line is closed
      if (prob.meta.id === "010") {
        const closedLineLeak = {
          open: [0, 0, 0],
          quantities: [10, 10, 10],
          netProfit: 1050,
        };
        const v10 = prob.judge(prob.cases[0].input, closedLineLeak, prob.cases[0].expectedOptimal, "en");
        expect(v10.ok).toBe(false);
        expect(v10.status).toBe("VIOLATION");
      }

      // Starter verification: #000-#003 -> VIOLATION, #004-#010 -> unimplemented / non-AC
      const starterRun = await runWashiExerciseCode(prob.washiStarter, [structuredClone(prob.cases[0].input)]);
      if (["000", "001", "002", "003"].includes(prob.meta.id)) {
        expect(starterRun.ok).toBe(true);
        const v = prob.judge(prob.cases[0].input, starterRun.outputs[0], prob.cases[0].expectedOptimal, "en");
        expect(v.status, `${prob.meta.id} starter verdict`).toBe("VIOLATION");
        expect(v.ok).toBe(false);
      } else {
        expect(starterRun.ok).toBe(false);
      }
    }

    // Verify solverStatus telemetry and honest verdict refinement for NotSolved, Infeasible, Unbounded, and Suboptimal on #001
    const p1 = PROBLEMS.find((p) => p.meta.id === "001")!;
    const p1In = structuredClone(p1.cases[0].input);
    const statusMsgs = UI_STRINGS.en.results.solverStatus;

    const suboptRun = await runWashiExerciseCode(
      p1.washiSolution.replace("import { Model, expr, maximize }", "import { Model, expr, minimize }").replace("maximize(", "minimize("),
      [p1In]
    );
    expect(suboptRun.ok).toBe(true);
    const suboptVerdict = p1.judge(p1In, suboptRun.outputs[0], p1.cases[0].expectedOptimal, "en");
    expect(suboptVerdict.status).toBe("SUBOPTIMAL");

    const omittedSolveRun = await runWashiExerciseCode(
      p1.washiSolution.replace("await m.solve();", ""),
      [p1In]
    );
    expect(omittedSolveRun.ok).toBe(true);
    expect(omittedSolveRun.metrics[0]?.solverStatus).toBe("NotSolved");
    const omittedVerdict = applySolverStatusToVerdict(
      p1.judge(p1In, omittedSolveRun.outputs[0], p1.cases[0].expectedOptimal, "en"),
      omittedSolveRun.metrics[0]?.solverStatus,
      statusMsgs
    );
    expect(omittedVerdict.status).toBe("RUNTIME_ERROR");
    expect(omittedVerdict.message).toContain("solve()");

    const infeasibleRun = await runWashiExerciseCode(
      p1.washiSolution.replace(
        "await m.solve();",
        "m.constraint(expr`${c} >= 999`); await m.solve();"
      ),
      [p1In]
    );
    expect(infeasibleRun.ok).toBe(true);
    expect(infeasibleRun.metrics[0]?.solverStatus).toBe("Infeasible");
    const infeasibleVerdict = applySolverStatusToVerdict(
      p1.judge(p1In, infeasibleRun.outputs[0], p1.cases[0].expectedOptimal, "en"),
      infeasibleRun.metrics[0]?.solverStatus,
      statusMsgs
    );
    expect(infeasibleVerdict.status).toBe("INFEASIBLE");

    const unboundedRun = await runWashiExerciseCode(
      p1.washiSolution.replace(/m\.constraint\([\s\S]*?\);/g, ""),
      [p1In]
    );
    expect(unboundedRun.ok).toBe(true);
    expect(unboundedRun.metrics[0]?.solverStatus).toBe("Unbounded");
    const unboundedVerdict = applySolverStatusToVerdict(
      p1.judge(p1In, unboundedRun.outputs[0], p1.cases[0].expectedOptimal, "en"),
      unboundedRun.metrics[0]?.solverStatus,
      statusMsgs
    );
    expect(unboundedVerdict.status).toBe("RUNTIME_ERROR");
    expect(unboundedVerdict.message).toContain("Unbounded");
  }, 60_000);

  itHighspy("cross-verifies every highspy Python solution.py against identical cases.json and shared judge()", () => {
    const jobs = PROBLEMS.map((p) => ({
      id: p.meta.id,
      code: p.highspySolution,
      inputs: p.cases.map((c) => c.input),
    }));

    const batch = runHighspyBatch(jobs);
    for (const prob of PROBLEMS) {
      const res = batch[prob.meta.id];
      expect(res?.ok, `${prob.meta.id} highspy error: ${res?.error}`).toBe(true);
      expect(res.outputs).toHaveLength(prob.cases.length);
      for (let i = 0; i < prob.cases.length; i++) {
        for (const locale of ["en", "ja", "zh"] as const) {
          const verdict = prob.judge(
            prob.cases[i].input,
            res.outputs![i],
            prob.cases[i].expectedOptimal,
            locale
          );
          expect(verdict.ok, `${prob.meta.id} highspy (${locale}) case[${i}]: ${verdict.message}`).toBe(true);
          expect(verdict.status).toBe("AC");
        }
      }
    }

    // Verify #000-#003 highspy starters reproduce intentional VIOLATION states
    const starterBatch = runHighspyBatch(
      ["000", "001", "002", "003"].map((id) => {
        const p = PROBLEMS.find((prob) => prob.meta.id === id)!;
        return {
          id: p.meta.id,
          code: p.highspyStarter,
          inputs: [p.cases[0].input],
        };
      })
    );
    for (const id of ["000", "001", "002", "003"]) {
      const p = PROBLEMS.find((prob) => prob.meta.id === id)!;
      const v = p.judge(p.cases[0].input, starterBatch[id].outputs![0], p.cases[0].expectedOptimal, "en");
      expect(v.status, `${id} python starter verdict`).toBe("VIOLATION");
    }
  }, 60_000);
});
