import { statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import * as washi from "../src/index.js";
import {
  MEASUREMENT_BOUNDARIES,
  validateIterations,
  summarizeSamples,
  countModelSize,
  buildSmallLpModel,
  buildSchedulingMipModel,
  verifySolvedModel,
  executeBrowserScenario,
  rebuildBenchmarkArtifacts,
  parseCliArgs,
  formatReportText,
  runBenchmarks,
} from "../scripts/run-benchmarks.mjs";

describe("Reproducible Modeler & Solver Benchmarks (#57)", () => {
  it("computes deterministic summary statistics and validates CLI and programmatic iteration counts", async () => {
    const odd = summarizeSamples([4.2, 1.5, 2.8]);
    expect(odd).toEqual({
      minMs: 1.5,
      medianMs: 2.8,
      meanMs: 2.833,
      maxMs: 4.2,
      samplesMs: [4.2, 1.5, 2.8],
    });

    const even = summarizeSamples([10, 2, 4, 8]);
    expect(even).toEqual({
      minMs: 2,
      medianMs: 6,
      meanMs: 6,
      maxMs: 10,
      samplesMs: [10, 2, 4, 8],
    });

    expect(parseCliArgs([], {})).toEqual({
      iterations: 5,
      json: false,
      includeBrowser: false,
    });
    expect(parseCliArgs(["--iterations=3", "--json", "--browser"], {})).toEqual({
      iterations: 3,
      json: true,
      includeBrowser: true,
    });
    expect(parseCliArgs(["--iterations", "7"], { RUN_BENCH_BROWSER: "1" })).toEqual({
      iterations: 7,
      json: false,
      includeBrowser: true,
    });
    expect(() => parseCliArgs(["--iterations=0"], {})).toThrow(/Invalid --iterations/);
    expect(() => parseCliArgs(["--unknown"], {})).toThrow(/Unknown CLI option/);

    // Programmatic validation of iteration counts
    expect(validateIterations(undefined)).toBe(5);
    expect(validateIterations(3)).toBe(3);
    for (const invalid of [0, -2, 1.5, Number.NaN, Number.POSITIVE_INFINITY, null, true, ""]) {
      expect(() => validateIterations(invalid)).toThrow(/Invalid iterations value/);
      await expect(runBenchmarks({ iterations: invalid as number })).rejects.toThrow(
        /Invalid iterations value/
      );
    }
  });

  it("builds deterministic small-lp and scheduling-mip models with exact problem dimensions", () => {
    const lp = buildSmallLpModel(washi);
    expect(countModelSize(lp)).toEqual({
      numVariables: 24,
      numContinuous: 24,
      numInteger: 0,
      numBinary: 0,
      numConstraints: 18,
      numNonZeros: 240,
    });

    const mip = buildSchedulingMipModel(washi, null);
    expect(countModelSize(mip)).toEqual({
      numVariables: 315,
      numContinuous: 21,
      numInteger: 0,
      numBinary: 294,
      numConstraints: 231,
      numNonZeros: 1680,
    });
    expect(mip.variables.every((v) => v.initialValue === undefined)).toBe(true);

    const seededMip = buildSchedulingMipModel(washi, {
      assign_w0_d0_s0: 1,
      shortage_d0_s0: 0,
    });
    expect(seededMip.getVarByName("assign_w0_d0_s0")?.initialValue).toBe(1);
    expect(seededMip.getVarByName("shortage_d0_s0")?.initialValue).toBe(0);
    expect(seededMip.getVarByName("assign_w0_d0_s1")?.initialValue).toBeUndefined();
  });

  it("excludes model construction from browser worker solve timings and validates every warm solve", async () => {
    const events: string[] = [];
    let workerSolveCalls = 0;

    class FakeModel {
      name = "FakeLP";
      sense = "Minimize";
      objectiveExpr = { terms: new Map(), constant: 0 };
      constraints = [];
      variables = [];
      objectiveValue = 42;
      solution = {
        status: "Optimal",
        objectiveValue: 42,
        values: { x: 1 },
        duals: {},
        reducedCosts: {},
        slacks: {},
      };

      async solve(arg: unknown) {
        if (arg && typeof arg === "object" && "useWorker" in arg) {
          workerSolveCalls++;
          events.push(`workerSolve:${workerSolveCalls}`);
          return "Optimal";
        }
        events.push("mockSolve");
        return "Optimal";
      }

      validateSolution() {
        return {
          valid: true,
          complete: true,
          summary: { maxConstraintViolation: 0 },
        };
      }
    }

    const fakeApi = {
      generateLpString: () => ({ lpString: "Minimize\n obj: x\nEnd\n" }),
      validateModelIntegrity: () => {
        events.push("validate");
      },
      MockSolver: class {
        constructor() {}
      },
    };

    const makeSmallLp = () => {
      events.push("build");
      return new FakeModel();
    };

    const scenarioOut = await executeBrowserScenario({
      api: fakeApi,
      scDef: {
        scenarioId: "small-lp",
        description: "Fake small-lp browser scenario",
        hints: null,
      },
      iterCount: 2,
      makeSmallLp,
      makeSchedulingMip: makeSmallLp,
      getSize: () => ({
        numVariables: 1,
        numContinuous: 1,
        numInteger: 0,
        numBinary: 0,
        numConstraints: 0,
        numNonZeros: 1,
      }),
      checkSolved: (arg: Parameters<typeof verifySolvedModel>[0]) => {
        events.push(`checkSolved:${arg.contextLabel}`);
        return verifySolvedModel(arg);
      },
    });

    expect(scenarioOut.warmWorkerSolveSamples).toHaveLength(2);
    expect(scenarioOut.valid).toBe(true);
    expect(scenarioOut.objectiveValue).toBe(42);
    // Verify cold build occurs before workerSolve:1, and warm build occurs before workerSolve:2 and workerSolve:3
    expect(events).toEqual([
      "build",
      "workerSolve:1",
      "checkSolved:small-lp (browser worker cold solve)",
      // Iteration 1
      "build",
      "validate",
      "build",
      "mockSolve",
      "build",
      "workerSolve:2",
      "checkSolved:small-lp (browser worker warm solve iteration 1)",
      // Iteration 2
      "build",
      "validate",
      "build",
      "mockSolve",
      "build",
      "workerSolve:3",
      "checkSolved:small-lp (browser worker warm solve iteration 2)",
    ]);

    // Verify warm solve failures (non-Optimal, invalid solution, or objective drift) throw immediately
    let callIdx = 0;
    await expect(
      executeBrowserScenario({
        api: fakeApi,
        scDef: { scenarioId: "small-lp", description: "Failing warm solve", hints: null },
        iterCount: 2,
        makeSmallLp: () => {
          const m = new FakeModel();
          m.solve = async (arg: unknown) => {
            if (arg && typeof arg === "object" && "useWorker" in arg) {
              callIdx++;
              if (callIdx === 2) {
                return "Infeasible";
              }
            }
            return "Optimal";
          };
          return m;
        },
        makeSchedulingMip: makeSmallLp,
        getSize: () => ({
          numVariables: 1,
          numContinuous: 1,
          numInteger: 0,
          numBinary: 0,
          numConstraints: 0,
          numNonZeros: 1,
        }),
        checkSolved: verifySolvedModel,
      })
    ).rejects.toThrow(/expected status "Optimal", got "Infeasible"/);

    expect(() =>
      verifySolvedModel({
        model: {},
        status: "Optimal",
        objectiveValue: 100.5,
        validation: { valid: true, complete: true, summary: { maxConstraintViolation: 0 } },
        expectedObjective: 100.0,
        contextLabel: "drift-check",
      })
    ).toThrow(/objective drift in drift-check/);

    expect(() =>
      verifySolvedModel({
        model: {},
        status: "Optimal",
        objectiveValue: 100,
        validation: { valid: false, complete: true, summary: { maxConstraintViolation: 0.25 } },
        expectedObjective: 100,
        contextLabel: "invalid-check",
      })
    ).toThrow(/invalid or incomplete solution in invalid-check/);
  });

  it("runs the benchmark suite with separated phase boundaries, solver parity, and browser version formatting", async () => {
    const report = await runBenchmarks({ iterations: 2, includeBrowser: false });

    expect(report.benchmarkSuite).toBe("@ohtaman/washi-reproducible-benchmarks");
    expect(report.environment.nodeVersion).toBe(process.version);
    expect(report.environment.platform).toBe(process.platform);
    expect(report.environment.cpuCores).toBeGreaterThan(0);
    expect(report.environment.browserWorkerIncluded).toBe(false);
    expect(report.environment.browser).toBeNull();
    expect(report.measurementBoundaries).toEqual(MEASUREMENT_BOUNDARIES);
    expect(report.measurementBoundaries.environmentNote).toContain("usesBrowserWorker");
    expect(report.browserWorkerScenarios).toEqual([]);
    expect(report.nodeScenarios).toHaveLength(5);

    const byKey = new Map(
      report.nodeScenarios.map((sc) => [`${sc.scenarioId}:${sc.solver.name}`, sc])
    );

    const lpHighs = byKey.get("small-lp:highs");
    const lpGlpk = byKey.get("small-lp:glpk");
    const mipHighs = byKey.get("scheduling-mip:highs");
    const mipWarmHighs = byKey.get("scheduling-mip-warm-start:highs");
    const mipGlpk = byKey.get("scheduling-mip:glpk");

    expect(lpHighs).toBeDefined();
    expect(lpGlpk).toBeDefined();
    expect(mipHighs).toBeDefined();
    expect(mipWarmHighs).toBeDefined();
    expect(mipGlpk).toBeDefined();

    // Verify deterministic mathematical results across solvers
    expect(lpHighs.solution.status).toBe("Optimal");
    expect(lpGlpk.solution.status).toBe("Optimal");
    expect(lpHighs.solution.valid).toBe(true);
    expect(lpGlpk.solution.valid).toBe(true);
    expect(lpHighs.solution.objectiveValue).toBeCloseTo(13577.142857, 4);
    expect(lpGlpk.solution.objectiveValue).toBeCloseTo(13577.142857, 4);

    expect(mipHighs.solution.status).toBe("Optimal");
    expect(mipWarmHighs.solution.status).toBe("Optimal");
    expect(mipGlpk.solution.status).toBe("Optimal");
    expect(mipHighs.solution.valid).toBe(true);
    expect(mipWarmHighs.solution.valid).toBe(true);
    expect(mipGlpk.solution.valid).toBe(true);
    expect(mipHighs.solution.objectiveValue).toBe(3357);
    expect(mipWarmHighs.solution.objectiveValue).toBe(3357);
    expect(mipGlpk.solution.objectiveValue).toBe(3357);

    // Verify phase separation and metadata structure (without asserting wall-clock speed thresholds)
    for (const sc of report.nodeScenarios) {
      expect(sc.environment).toBe("node");
      expect(sc.usesBrowserWorker).toBe(false);
      expect(typeof sc.coldStart.coldRuntimeInitMs).toBe("number");
      expect(sc.coldStart.coldRuntimeInitMs).toBeGreaterThanOrEqual(0);
      expect(typeof sc.coldStart.coldFirstSolveMs).toBe("number");
      expect(sc.coldStart.coldFirstSolveMs).toBeGreaterThanOrEqual(0);
      expect(sc.warmRepeated.runtimeCondition).toBe("reused-in-process-wasm");
      expect(sc.warmRepeated.iterations).toBe(2);

      const phases = sc.warmRepeated.phases;
      for (const phaseKey of [
        "modelBuildMs",
        "validationMs",
        "resultMappingMs",
        "adapterSolveMs",
        "endToEndSolveMs",
      ]) {
        const stat = phases[phaseKey];
        expect(stat.samplesMs).toHaveLength(2);
        expect(stat.minMs).toBeGreaterThanOrEqual(0);
        expect(stat.maxMs).toBeGreaterThanOrEqual(stat.minMs);
      }

      if (sc.solver.serializationMode === "lp-string") {
        expect(sc.modelSize.lpStringBytes).toBeGreaterThan(0);
        expect(phases.lpSerializationMs.samplesMs).toHaveLength(2);
        expect(phases.symbolMapMs).toBeNull();
      } else {
        expect(sc.modelSize.lpStringBytes).toBeNull();
        expect(phases.symbolMapMs.samplesMs).toHaveLength(2);
        expect(phases.lpSerializationMs).toBeNull();
      }
    }

    const text = formatReportText(report);
    expect(text).toContain("WaSHI Reproducible Modeler & Solver Benchmarks");
    expect(text).toContain("Node.js In-Process WASM Measurements (usesBrowserWorker: false)");
    expect(text).toContain("[small-lp] solver=highs@");
    expect(text).toContain("[small-lp] solver=glpk@");
    expect(text).toContain("[scheduling-mip] solver=highs@");
    expect(text).toContain("[scheduling-mip-warm-start] solver=highs@");
    expect(text).toContain("[scheduling-mip] solver=glpk@");

    // Verify browser version formatting when browser metadata and scenarios are present
    const syntheticBrowserReport = {
      ...report,
      environment: {
        ...report.environment,
        browserWorkerIncluded: true,
        browser: {
          name: "chromium-headless",
          version: "130.0.6723.31",
          playwrightVersion: "1.59.1",
          userAgent: "HeadlessChrome/130.0.6723.31",
        },
      },
      browserWorkerScenarios: [
        {
          scenarioId: "small-lp",
          description: "Deterministic 24-variable LP (Browser Worker)",
          environment: "chromium-headless",
          browserVersion: "130.0.6723.31",
          playwrightVersion: "1.59.1",
          usesBrowserWorker: true,
          solver: {
            name: "highs",
            version: report.environment.solvers.highs,
            options: { useWorker: true, presolve: "on" },
            serializationMode: "lp-string",
          },
          modelSize: lpHighs.modelSize,
          solution: lpHighs.solution,
          coldStart: {
            runtimeCondition: "fresh-web-worker-and-wasm",
            browserWorkerColdSolveMs: 12.34,
          },
          warmRepeated: {
            runtimeCondition: "reused-web-worker",
            iterations: 2,
            phases: {
              modelBuildMs: lpHighs.warmRepeated.phases.modelBuildMs,
              validationMs: lpHighs.warmRepeated.phases.validationMs,
              lpSerializationMs: lpHighs.warmRepeated.phases.lpSerializationMs,
              resultMappingMs: lpHighs.warmRepeated.phases.resultMappingMs,
              browserWorkerWarmSolveMs: lpHighs.warmRepeated.phases.adapterSolveMs,
            },
          },
        },
      ],
    };
    const browserText = formatReportText(syntheticBrowserReport);
    expect(browserText).toContain("Browser  : chromium-headless 130.0.6723.31 (Playwright 1.59.1)");
    expect(browserText).toContain("browser=chromium@130.0.6723.31");
  });

  it("rebuilds distribution artifacts before benchmarking when rebuild is enabled", async () => {
    const distWashiPath = path.resolve(process.cwd(), "dist/lib/washi.js");
    const beforeMtime = statSync(distWashiPath, { throwIfNoEntry: false })?.mtimeMs ?? 0;
    await new Promise((r) => setTimeout(r, 20));
    await rebuildBenchmarkArtifacts({ includeBrowser: false });
    const afterMtime = statSync(distWashiPath).mtimeMs;
    expect(afterMtime).toBeGreaterThan(beforeMtime);
  });
});

