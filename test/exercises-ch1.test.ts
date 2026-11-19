import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseProblemMarkdown } from "../examples/web-demo/exercises/src/ui/markdown.js";
import { runWashiExerciseCode } from "../examples/web-demo/exercises/src/runner/washi-runner.js";
import { CHAPTERS, PROBLEMS } from "../examples/web-demo/exercises/src/problems/registry.js";

const GAMEY_COPY_RE =
  /\bBoss\b|\u30dc\u30b9|\u{1f451}|\u30af\u30a8\u30b9\u30c8|\u6483\u7834|\u901a\u5173|\u5173\u5361|\u9053\u5834|\u9053\u573a|\u6311\u6226/ui;

const EXPECTED_IDS = [
  "T1",
  "T2",
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

describe("Exercises Phase 1 — Tutorial (T1-T2) & Chapter 1 (#001-#010)", () => {
  it("registers all 10 chapters in the roadmap and all 12 Phase 1 problems with complete metadata", () => {
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
      expect(["tutorial", "intro", "core", "applied", "capstone"]).toContain(prob.meta.role);
      expect(prob.washiStarter).not.toContain("ReducedCostBoss");
      expect(prob.washiSolution).not.toContain("ReducedCostBoss");
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
        expect(prob.markdown[locale]).not.toMatch(GAMEY_COPY_RE);

        const sections = parseProblemMarkdown(prob.markdown[locale]);
        expect(sections.title.trim().length, `${prob.meta.id} (${locale}) title`).toBeGreaterThan(0);
        expect(sections.scenario.trim().length, `${prob.meta.id} (${locale}) scenario`).toBeGreaterThan(0);
        expect(sections.ioSpec.trim().length, `${prob.meta.id} (${locale}) ioSpec`).toBeGreaterThan(0);
        expect(sections.example.trim().length, `${prob.meta.id} (${locale}) example`).toBeGreaterThan(0);
        expect(sections.hint1.trim().length, `${prob.meta.id} (${locale}) hint1`).toBeGreaterThan(0);
        expect(sections.hint2.trim().length, `${prob.meta.id} (${locale}) hint2`).toBeGreaterThan(0);
        expect(sections.formulation.trim().length, `${prob.meta.id} (${locale}) formulation`).toBeGreaterThan(0);

        for (const c of prob.cases) {
          expect(c.name[locale].trim().length).toBeGreaterThan(0);
          expect(c.name[locale]).not.toMatch(GAMEY_COPY_RE);
        }
      }
    }

    // Verify localized judge strings in every problem JSON are free of contrived gamey terms
    const problemsRoot = path.resolve(import.meta.dirname, "../examples/web-demo/exercises/src/problems");
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((ent) => {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) return walk(full);
        return ent.name.endsWith(".json") ? [full] : [];
      });
    for (const jsonPath of walk(problemsRoot)) {
      const text = fs.readFileSync(jsonPath, "utf-8");
      expect(text, jsonPath).not.toMatch(GAMEY_COPY_RE);
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

      // Malformed / invalid empty object output must never accidentally pass
      const badVerdict = prob.judge(prob.cases[0].input, {}, prob.cases[0].expectedOptimal, "ja");
      expect(badVerdict.ok, `${prob.meta.id} accepted empty output`).toBe(false);
      expect(badVerdict.status).toBe("VIOLATION");

      // #010 must enforce dual feasibility A^T y >= c across all base + candidate columns
      if (prob.meta.id === "010") {
        const invalidDualOutput = {
          baseQuantities: [40, 20],
          candidateQuantities: [0, 0],
          optimalProfit: 2800,
          shadowPrices: [28, 0, 0],
          candidateReducedCosts: [-36, -11],
          minMarginIncreaseNeeded: [36, 11],
        };
        const dualVerdict = prob.judge(
          prob.cases[0].input,
          invalidDualOutput,
          prob.cases[0].expectedOptimal,
          "en"
        );
        expect(dualVerdict.ok).toBe(false);
        expect(dualVerdict.status).toBe("VIOLATION");
      }

      // Starter verification: T1 must intentionally return SUBOPTIMAL, T2 VIOLATION, main problems non-AC error
      const starterRun = await runWashiExerciseCode(prob.washiStarter, [structuredClone(prob.cases[0].input)]);
      if (prob.meta.id === "T1") {
        expect(starterRun.ok).toBe(true);
        const v = prob.judge(prob.cases[0].input, starterRun.outputs[0], prob.cases[0].expectedOptimal, "en");
        expect(v.status).toBe("SUBOPTIMAL");
        expect(v.ok).toBe(false);
      } else if (prob.meta.id === "T2") {
        expect(starterRun.ok).toBe(true);
        const v = prob.judge(prob.cases[0].input, starterRun.outputs[0], prob.cases[0].expectedOptimal, "en");
        expect(v.status).toBe("VIOLATION");
        expect(v.ok).toBe(false);
      } else {
        expect(starterRun.ok).toBe(false);
      }
    }
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

    // Verify tutorial highspy starters reproduce the exact intentional SUBOPTIMAL (T1) and VIOLATION (T2) states
    const starterBatch = runHighspyBatch(
      PROBLEMS.slice(0, 2).map((p) => ({
        id: p.meta.id,
        code: p.highspyStarter,
        inputs: [p.cases[0].input],
      }))
    );
    const t1StarterV = PROBLEMS[0].judge(
      PROBLEMS[0].cases[0].input,
      starterBatch["T1"].outputs![0],
      PROBLEMS[0].cases[0].expectedOptimal,
      "en"
    );
    expect(t1StarterV.status).toBe("SUBOPTIMAL");
    const t2StarterV = PROBLEMS[1].judge(
      PROBLEMS[1].cases[0].input,
      starterBatch["T2"].outputs![0],
      PROBLEMS[1].cases[0].expectedOptimal,
      "en"
    );
    expect(t2StarterV.status).toBe("VIOLATION");
  }, 60_000);
});
