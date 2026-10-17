import { describe, it, expect } from "vitest";
import * as washi from "../src/index.js";
import {
  MEASUREMENT_BOUNDARIES,
  summarizeSamples,
  countModelSize,
  buildSmallLpModel,
  buildSchedulingMipModel,
  parseCliArgs,
  formatReportText,
  runBenchmarks,
} from "../scripts/run-benchmarks.mjs";

describe("Reproducible Modeler & Solver Benchmarks (#57)", () => {
  it("computes deterministic summary statistics and parses CLI flags", () => {
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

  it("runs the benchmark suite with separated phase boundaries, solver parity, and no timing thresholds", async () => {
    const report = await runBenchmarks({ iterations: 2, includeBrowser: false });

    expect(report.benchmarkSuite).toBe("@ohtaman/washi-reproducible-benchmarks");
    expect(report.environment.nodeVersion).toBe(process.version);
    expect(report.environment.platform).toBe(process.platform);
    expect(report.environment.cpuCores).toBeGreaterThan(0);
    expect(report.environment.browserWorkerIncluded).toBe(false);
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
  });
});
