import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

/**
 * Explicit measurement boundary descriptions included in every benchmark report.
 * Timings are measured directly per phase; unrelated timings are never subtracted
 * from end-to-end solves and labeled "native solver time".
 */
export const MEASUREMENT_BOUNDARIES = Object.freeze({
  coldRuntimeInitMs:
    "One-time solver runtime/WASM module initialization (getHighs() or getGlpk()) after clearing the module cache.",
  coldFirstSolveMs:
    "First end-to-end model build + model.solve() call on a freshly initialized runtime.",
  modelBuildMs:
    "Constructing a fresh Model instance, variables, linear expressions, constraints, and objective in JavaScript.",
  validationMs:
    "Running validateModelIntegrity(model) on the constructed Model instance.",
  lpSerializationMs:
    "Running generateLpString(modelData) to serialize CPLEX LP text and build symbol maps (applicable to LP-string adapters such as HiGHS; null for structured adapters such as GLPK).",
  symbolMapMs:
    "Running buildLpSymbolMaps(modelData) to build collision-safe variable/constraint symbol maps without LP text serialization (applicable to structured adapters such as GLPK; null for LP-string adapters).",
  resultMappingMs:
    "Executing model.solve() against an in-memory MockSolver pre-populated with the full optimal primal/dual payload—measuring Model preflight and Var/Constraint solution hydration without WASM solver execution.",
  adapterSolveMs:
    "Calling solver.solve(modelData, options) on an already-constructed model with a warm (reused) WASM runtime. Includes adapter input translation (LP string or GLPK problem object), WASM solver execution, and adapter result extraction.",
  endToEndSolveMs:
    "Full user workflow on a warm (reused) runtime: fresh model construction + model.solve(options) + solution hydration.",
  browserWorkerColdSolveMs:
    "First model.solve({ useWorker: true }) on a pre-built Model in a fresh headless Chromium context, including Web Worker creation, WASM fetch/compilation inside the Worker, structured-clone message transfer, and result hydration (excludes modelBuildMs).",
  browserWorkerWarmSolveMs:
    "Repeated model.solve({ useWorker: true }) calls on pre-built Models in Chromium reusing the active Web Worker and loaded WASM runtime (includes LP serialization, postMessage structured clone, Worker WASM execution, and result hydration; excludes modelBuildMs).",
  environmentNote:
    "Node.js in-process WASM (usesBrowserWorker: false) and Browser Web Worker execution (usesBrowserWorker: true) are distinct execution environments with different thread/serialization boundaries and are not directly interchangeable baselines.",
});

/**
 * Validate that the iteration count is a positive integer (>= 1).
 */
export function validateIterations(value, flagName = "iterations") {
  const parsed = value === undefined ? 5 : Number(value);
  if (
    typeof value === "boolean" ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    !Number.isInteger(parsed) ||
    parsed < 1
  ) {
    throw new Error(
      `Invalid ${flagName} value: ${String(value)}. Expected a positive integer (>= 1).`
    );
  }
  return parsed;
}

/**
 * Compute summary statistics (min, median, mean, max, samples) for an array of millisecond timings.
 */
export function summarizeSamples(samples) {
  const clean = samples.map((x) => Number(x.toFixed(3)));
  const sorted = [...clean].sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) {
    return { minMs: 0, medianMs: 0, meanMs: 0, maxMs: 0, samplesMs: [] };
  }
  const mid = Math.floor(count / 2);
  const median =
    count % 2 === 1
      ? sorted[mid]
      : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(3));
  const sum = clean.reduce((acc, v) => acc + v, 0);
  const mean = Number((sum / count).toFixed(3));
  return {
    minMs: sorted[0],
    medianMs: median,
    meanMs: mean,
    maxMs: sorted[count - 1],
    samplesMs: clean,
  };
}

/**
 * ExtractSolveModelData helper mirroring Model's internal SolveModelData view.
 */
function toSolveModelData(model) {
  return {
    name: model.name,
    sense: model.sense,
    objective: model.objectiveExpr,
    constraints: model.constraints,
    variables: model.variables,
    logicalConstraints: model.logicalConstraints,
    boolVars: model.boolVars,
  };
}

/**
 * Count total non-zero linear coefficients across all constraints and the objective.
 */
export function countModelSize(model) {
  let numContinuous = 0;
  let numInteger = 0;
  let numBinary = 0;
  for (const v of model.variables) {
    if (v.type === "Continuous") numContinuous++;
    else if (v.type === "Integer") numInteger++;
    else if (v.type === "Binary") numBinary++;
  }
  let constraintNonZeros = 0;
  for (const c of model.constraints) {
    for (const [, coef] of c.lhs.terms) {
      if (coef !== 0) constraintNonZeros++;
    }
  }
  let objectiveNonZeros = 0;
  const obj = model.objectiveExpr;
  const terms = "linearTerms" in obj ? obj.linearTerms : obj.terms;
  if (terms) {
    for (const [, coef] of terms) {
      if (coef !== 0) objectiveNonZeros++;
    }
  }
  return {
    numVariables: model.variables.length,
    numContinuous,
    numInteger,
    numBinary,
    numConstraints: model.constraints.length,
    numNonZeros: constraintNonZeros + objectiveNonZeros,
  };
}

/**
 * Scenario 1: Deterministic multi-product resource allocation Linear Program (small-lp).
 * 24 continuous variables, 18 linear constraints (12 resource capacities + 6 group demand floors).
 */
export function buildSmallLpModel(api) {
  const { Model, sum, maximize } = api;
  const m = new Model("SmallResourceAllocationLP");
  const numProducts = 24;
  const numResources = 12;

  const x = m.continuous(numProducts, { lb: 0, ub: 120, prefix: "prod" });

  const profitTerms = [];
  for (let p = 0; p < numProducts; p++) {
    const unitProfit = 15 + ((p * 17 + 11) % 35);
    profitTerms.push(x[p].mul(unitProfit));
  }
  // Include a non-zero constant offset (+250) to exercise offset handling
  m.objective(maximize(sum(profitTerms).add(250)));

  for (let r = 0; r < numResources; r++) {
    const rowTerms = [];
    for (let p = 0; p < numProducts; p++) {
      if ((r * 7 + p * 13) % 3 !== 0) {
        const usage = 1 + ((r * 19 + p * 23) % 6);
        rowTerms.push(x[p].mul(usage));
      }
    }
    const capacity = 900 + r * 60;
    m.constraint(sum(rowTerms).le(capacity), `res_cap_${r}`);
  }

  for (let g = 0; g < 6; g++) {
    const groupVars = [x[g * 4], x[g * 4 + 1], x[g * 4 + 2], x[g * 4 + 3]];
    const minGroupOutput = 20 + g * 5;
    m.constraint(sum(groupVars).ge(minGroupOutput), `group_min_${g}`);
  }

  return m;
}

/**
 * Scenario 2: Deterministic multi-day staff shift scheduling Mixed-Integer Program (scheduling-mip).
 * 14 workers x 7 days x 3 shifts = 294 binary assignment variables + 21 continuous shortage slack variables = 315 variables.
 * 231 constraints (coverage, max 1 shift/day, weekly workload bounds, and rest-window turnarounds).
 *
 * When `initialValuesByName` is provided, populates `initialValue` on each variable during model construction
 * to benchmark rebuilt-model MIP warm starts (`#48`).
 */
export function buildSchedulingMipModel(api, initialValuesByName = null) {
  const { Model, sum, minimize } = api;
  const m = new Model("StaffShiftSchedulingMIP");
  const numWorkers = 14;
  const numDays = 7;
  const numShifts = 3; // 0: Morning, 1: Evening, 2: Night

  const assign = Array.from({ length: numWorkers }, (_, w) =>
    Array.from({ length: numDays }, (__, d) =>
      Array.from({ length: numShifts }, (___, s) => {
        const name = `assign_w${w}_d${d}_s${s}`;
        const rawHint =
          initialValuesByName && Object.prototype.hasOwnProperty.call(initialValuesByName, name)
            ? initialValuesByName[name]
            : undefined;
        return m.binary(name, rawHint !== undefined ? { initialValue: Math.round(rawHint) } : undefined);
      })
    )
  );

  const shortage = Array.from({ length: numDays }, (_, d) =>
    Array.from({ length: numShifts }, (__, s) => {
      const name = `shortage_d${d}_s${s}`;
      const rawHint =
        initialValuesByName && Object.prototype.hasOwnProperty.call(initialValuesByName, name)
          ? initialValuesByName[name]
          : undefined;
      return m.continuous(name, {
        lb: 0,
        ub: numWorkers,
        ...(rawHint !== undefined ? { initialValue: Math.max(0, rawHint) } : {}),
      });
    })
  );

  const costTerms = [];
  for (let w = 0; w < numWorkers; w++) {
    for (let d = 0; d < numDays; d++) {
      for (let s = 0; s < numShifts; s++) {
        const baseCost = 40 + ((w * 11 + d * 7 + s * 19) % 25);
        const shiftPremium = s === 2 ? 15 : s === 1 ? 5 : 0;
        const weekendPremium = d >= 5 ? 10 : 0;
        costTerms.push(assign[w][d][s].mul(baseCost + shiftPremium + weekendPremium));
      }
    }
  }
  for (let d = 0; d < numDays; d++) {
    for (let s = 0; s < numShifts; s++) {
      costTerms.push(shortage[d][s].mul(500));
    }
  }
  m.objective(minimize(sum(costTerms)));

  // 1. Shift demand coverage constraints (21 constraints)
  for (let d = 0; d < numDays; d++) {
    const requiredByShift = d < 5 ? [4, 4, 2] : [3, 3, 2];
    for (let s = 0; s < numShifts; s++) {
      const assignedWorkers = [];
      for (let w = 0; w < numWorkers; w++) {
        assignedWorkers.push(assign[w][d][s]);
      }
      m.constraint(
        sum(assignedWorkers).add(shortage[d][s]).ge(requiredByShift[s]),
        `cover_d${d}_s${s}`
      );
    }
  }

  // 2. At most one shift per worker per day (98 constraints)
  for (let w = 0; w < numWorkers; w++) {
    for (let d = 0; d < numDays; d++) {
      m.constraint(
        sum([assign[w][d][0], assign[w][d][1], assign[w][d][2]]).le(1),
        `daily_one_w${w}_d${d}`
      );
    }
  }

  // 3. Weekly min/max shifts per worker (28 constraints)
  for (let w = 0; w < numWorkers; w++) {
    const weeklyShifts = [];
    for (let d = 0; d < numDays; d++) {
      for (let s = 0; s < numShifts; s++) {
        weeklyShifts.push(assign[w][d][s]);
      }
    }
    m.constraint(sum(weeklyShifts).le(5), `weekly_max_w${w}`);
    m.constraint(sum(weeklyShifts).ge(3), `weekly_min_w${w}`);
  }

  // 4. Rest window: Night shift (s=2) on day d forbids Morning shift (s=0) on day d+1 (84 constraints)
  for (let w = 0; w < numWorkers; w++) {
    for (let d = 0; d < numDays - 1; d++) {
      m.constraint(
        assign[w][d][2].add(assign[w][d + 1][0]).le(1),
        `rest_w${w}_d${d}`
      );
    }
  }

  return m;
}

/**
 * Rebuild library (and optionally browser) distribution bundles silently before benchmarking
 * so `npm run bench` / `node scripts/run-benchmarks.mjs` never measures stale `dist/` artifacts
 * and `--json` stdout remains clean.
 */
export async function rebuildBenchmarkArtifacts({ includeBrowser = false } = {}) {
  const { build } = await import("vite");
  await build({
    configFile: path.join(repoRoot, "vite.config.lib.ts"),
    logLevel: "silent",
  });
  process.env.WASHI_BROWSER_FORMAT = "runtime";
  await build({
    configFile: path.join(repoRoot, "vite.config.browser.ts"),
    logLevel: "silent",
  });
  delete process.env.WASHI_BROWSER_FORMAT;

  if (includeBrowser) {
    delete process.env.WASHI_BROWSER_FORMAT;
    process.env.WASHI_BROWSER_TARGET = "core";
    await build({
      configFile: path.join(repoRoot, "vite.config.browser.ts"),
      logLevel: "silent",
    });
    delete process.env.WASHI_BROWSER_TARGET;
  }
}

async function loadWashiModules({ includeBrowser = false, rebuild } = {}) {
  if (process.env.VITEST && rebuild !== true) {
    const api = await import("../src/index.ts");
    const glpk = await import("../src/modeler/solvers/glpk/index.ts");
    return { api, glpk };
  }
  if (rebuild !== false) {
    await rebuildBenchmarkArtifacts({ includeBrowser });
  }
  const distWashi = path.join(repoRoot, "dist/lib/washi.js");
  const distGlpk = path.join(repoRoot, "dist/lib/solvers/glpk.js");
  const cacheBust = `?v=${Date.now()}`;
  const api = await import(`${pathToFileURL(distWashi).href}${cacheBust}`);
  const glpk = await import(`${pathToFileURL(distGlpk).href}${cacheBust}`);
  return { api, glpk };
}

function readPackageVersions() {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  let highsVersion = pkg.dependencies?.highs ?? "unknown";
  let glpkVersion =
    pkg.devDependencies?.["glpk.js"] ?? pkg.peerDependencies?.["glpk.js"] ?? "unknown";
  let playwrightVersion = pkg.devDependencies?.playwright ?? "unknown";
  try {
    const highsPkg = JSON.parse(
      readFileSync(path.join(repoRoot, "node_modules/highs/package.json"), "utf8")
    );
    highsVersion = highsPkg.version || highsVersion;
  } catch {
    // fallback to package.json range
  }
  try {
    const glpkPkg = JSON.parse(
      readFileSync(path.join(repoRoot, "node_modules/glpk.js/package.json"), "utf8")
    );
    glpkVersion = glpkPkg.version || glpkVersion;
  } catch {
    // fallback to package.json range
  }
  try {
    const pwPkg = JSON.parse(
      readFileSync(path.join(repoRoot, "node_modules/playwright/package.json"), "utf8")
    );
    playwrightVersion = pwPkg.version || playwrightVersion;
  } catch {
    // fallback to package.json range
  }
  return {
    washiVersion: pkg.version,
    highsVersion,
    glpkVersion,
    playwrightVersion,
  };
}

/**
 * Verify that a solved Model (or SolverResult against a Model) achieved Optimal status,
 * passed solution validation, and matched the expected objective value (when provided).
 */
export function verifySolvedModel({
  model,
  status,
  objectiveValue,
  validation,
  expectedObjective,
  contextLabel,
}) {
  if (status !== "Optimal") {
    throw new Error(
      `Benchmark solve failed in ${contextLabel}: expected status "Optimal", got "${String(status)}".`
    );
  }
  if (typeof objectiveValue !== "number" || !Number.isFinite(objectiveValue)) {
    throw new Error(
      `Benchmark solve failed in ${contextLabel}: non-finite objectiveValue (${String(objectiveValue)}).`
    );
  }
  if (!validation.valid || !validation.complete) {
    throw new Error(
      `Benchmark solve produced an invalid or incomplete solution in ${contextLabel}: valid=${validation.valid}, complete=${validation.complete}, maxViolation=${validation.summary?.maxConstraintViolation}.`
    );
  }
  if (
    typeof expectedObjective === "number" &&
    Math.abs(objectiveValue - expectedObjective) > 1e-4
  ) {
    throw new Error(
      `Benchmark solve objective drift in ${contextLabel}: expected ${expectedObjective}, got ${objectiveValue}.`
    );
  }
  return {
    model,
    status,
    objectiveValue: Number(objectiveValue.toFixed(6)),
    valid: validation.valid && validation.complete,
    maxViolation: validation.summary.maxConstraintViolation,
  };
}

/**
 * Run a single benchmark scenario in Node.js with separated phase measurements.
 */
async function measureNodeScenario({
  scenarioId,
  description,
  buildModel,
  solverKey,
  solverVersion,
  solverOptions,
  serializationMode,
  coldCondition,
  resetRuntime,
  initRuntime,
  api,
  iterations,
}) {
  const {
    validateModelIntegrity,
    generateLpString,
    buildLpSymbolMaps,
    MockSolver,
    getSolver,
  } = api;

  // 1. Cold runtime initialization + first cold end-to-end solve
  resetRuntime();
  const tColdInit0 = performance.now();
  await initRuntime();
  const coldRuntimeInitMs = Number((performance.now() - tColdInit0).toFixed(3));

  resetRuntime();
  const tColdSolve0 = performance.now();
  const coldModel = buildModel();
  const coldStatus = await coldModel.solve({ solver: solverKey, ...solverOptions });
  const coldFirstSolveMs = Number((performance.now() - tColdSolve0).toFixed(3));

  const coldValidation = coldModel.validateSolution();
  const coldChecked = verifySolvedModel({
    model: coldModel,
    status: coldStatus,
    objectiveValue: coldModel.objectiveValue,
    validation: coldValidation,
    contextLabel: `${scenarioId} (${solverKey} cold solve)`,
  });

  const referenceSolution = coldModel.solution;
  const modelSize = countModelSize(coldModel);

  let lpStringBytes = null;
  if (serializationMode === "lp-string") {
    const { lpString } = generateLpString(toSolveModelData(coldModel));
    lpStringBytes = Buffer.byteLength(lpString, "utf8");
  }

  // Prepare pre-populated MockSolver to measure result mapping in isolation
  const mockSolver = new MockSolver({
    status: "Optimal",
    terminationStatus: "Optimal",
    hasPrimalSolution: true,
    objectiveValue: referenceSolution?.objectiveValue ?? 0,
    values: referenceSolution?.values ?? {},
    duals: referenceSolution?.duals ?? {},
    reducedCosts: referenceSolution?.reducedCosts ?? {},
    slacks: referenceSolution?.slacks ?? {},
  });

  // 2. Repeated warm measurements on the already-initialized runtime
  const modelBuildSamples = [];
  const validationSamples = [];
  const lpSerializationSamples = [];
  const symbolMapSamples = [];
  const resultMappingSamples = [];
  const adapterSolveSamples = [];
  const endToEndSolveSamples = [];

  let lastWarmStatus = coldChecked.status;
  let lastWarmObjective = coldChecked.objectiveValue;
  let allWarmValid = coldChecked.valid;
  let maxViolation = coldChecked.maxViolation;

  for (let i = 0; i < iterations; i++) {
    // Phase A: Model construction
    const tBuild0 = performance.now();
    const m = buildModel();
    const tBuild1 = performance.now();
    modelBuildSamples.push(tBuild1 - tBuild0);

    const modelData = toSolveModelData(m);

    // Phase B: Integrity validation
    const tVal0 = performance.now();
    validateModelIntegrity(m);
    const tVal1 = performance.now();
    validationSamples.push(tVal1 - tVal0);

    // Phase C: Serialization / symbol mapping
    if (serializationMode === "lp-string") {
      const tLp0 = performance.now();
      generateLpString(modelData);
      const tLp1 = performance.now();
      lpSerializationSamples.push(tLp1 - tLp0);
    } else {
      const tSym0 = performance.now();
      buildLpSymbolMaps(modelData);
      const tSym1 = performance.now();
      symbolMapSamples.push(tSym1 - tSym0);
    }

    // Phase D: Result mapping in isolation (via MockSolver on a fresh model copy)
    const mappingModel = buildModel();
    const tMap0 = performance.now();
    await mappingModel.solve(mockSolver);
    const tMap1 = performance.now();
    resultMappingSamples.push(tMap1 - tMap0);

    // Phase E: Adapter solve on pre-built modelData (warm runtime)
    const solverInstance = getSolver(solverKey, solverOptions);
    const tAdapter0 = performance.now();
    const adapterResult = await solverInstance.solve(modelData, solverOptions);
    const tAdapter1 = performance.now();
    const adapterValidation = m.validateSolution({ values: adapterResult.values });
    const adapterChecked = verifySolvedModel({
      model: m,
      status: adapterResult.status,
      objectiveValue: adapterResult.objectiveValue,
      validation: adapterValidation,
      expectedObjective: coldChecked.objectiveValue,
      contextLabel: `${scenarioId} (${solverKey} warm adapterSolve iteration ${i + 1})`,
    });
    adapterSolveSamples.push(tAdapter1 - tAdapter0);
    allWarmValid = allWarmValid && adapterChecked.valid;
    maxViolation = Math.max(maxViolation, adapterChecked.maxViolation);

    // Phase F: Full end-to-end model build + solve + hydration (warm runtime)
    const tE2E0 = performance.now();
    const e2eModel = buildModel();
    const warmStatus = await e2eModel.solve({ solver: solverKey, ...solverOptions });
    const tE2E1 = performance.now();
    const warmValidation = e2eModel.validateSolution();
    const warmChecked = verifySolvedModel({
      model: e2eModel,
      status: warmStatus,
      objectiveValue: e2eModel.objectiveValue,
      validation: warmValidation,
      expectedObjective: coldChecked.objectiveValue,
      contextLabel: `${scenarioId} (${solverKey} warm endToEndSolve iteration ${i + 1})`,
    });
    endToEndSolveSamples.push(tE2E1 - tE2E0);
    lastWarmStatus = warmChecked.status;
    lastWarmObjective = warmChecked.objectiveValue;
    allWarmValid = allWarmValid && warmChecked.valid;
    maxViolation = Math.max(maxViolation, warmChecked.maxViolation);
  }

  return {
    scenarioId,
    description,
    environment: "node",
    usesBrowserWorker: false,
    solver: {
      name: solverKey,
      version: solverVersion,
      options: solverOptions,
      serializationMode,
    },
    modelSize: {
      ...modelSize,
      lpStringBytes,
    },
    solution: {
      status: lastWarmStatus,
      objectiveValue: lastWarmObjective,
      valid: allWarmValid,
      maxViolation,
      valuesSnapshot: referenceSolution?.values ?? {},
    },
    coldStart: {
      runtimeCondition: coldCondition,
      coldRuntimeInitMs,
      coldFirstSolveMs,
    },
    warmRepeated: {
      runtimeCondition: "reused-in-process-wasm",
      iterations,
      phases: {
        modelBuildMs: summarizeSamples(modelBuildSamples),
        validationMs: summarizeSamples(validationSamples),
        lpSerializationMs:
          serializationMode === "lp-string"
            ? summarizeSamples(lpSerializationSamples)
            : null,
        symbolMapMs:
          serializationMode === "symbol-maps"
            ? summarizeSamples(symbolMapSamples)
            : null,
        resultMappingMs: summarizeSamples(resultMappingSamples),
        adapterSolveMs: summarizeSamples(adapterSolveSamples),
        endToEndSolveMs: summarizeSamples(endToEndSolveSamples),
      },
    },
  };
}

/**
 * In-page Browser Worker scenario execution logic.
 * Exported so unit tests can directly verify that `browserWorkerColdSolveMs` and
 * `browserWorkerWarmSolveMs` exclude model construction (`build()`) and validate
 * every warm worker solve before recording samples.
 */
export async function executeBrowserScenario({
  api,
  scDef,
  iterCount,
  makeSmallLp,
  makeSchedulingMip,
  getSize,
  checkSolved,
}) {
  const build =
    scDef.scenarioId === "small-lp"
      ? () => makeSmallLp(api)
      : () => makeSchedulingMip(api, scDef.hints);

  // Build model BEFORE starting the cold Worker solve timer so modelBuildMs is excluded
  const firstModel = build();
  const tCold0 = performance.now();
  const firstStatus = await firstModel.solve({
    solver: "highs",
    useWorker: true,
    presolve: "on",
  });
  const coldSolveMs = Number((performance.now() - tCold0).toFixed(3));
  const firstValidation = firstModel.validateSolution();
  const coldChecked = checkSolved({
    model: firstModel,
    status: firstStatus,
    objectiveValue: firstModel.objectiveValue,
    validation: firstValidation,
    contextLabel: `${scDef.scenarioId} (browser worker cold solve)`,
  });

  const refSolution = firstModel.solution;
  const size = getSize(firstModel);
  const { lpString } = api.generateLpString({
    name: firstModel.name,
    sense: firstModel.sense,
    objective: firstModel.objectiveExpr,
    constraints: firstModel.constraints,
    variables: firstModel.variables,
  });
  const lpStringBytes = new TextEncoder().encode(lpString).byteLength;

  const mockSolver = new api.MockSolver({
    status: "Optimal",
    terminationStatus: "Optimal",
    hasPrimalSolution: true,
    objectiveValue: refSolution?.objectiveValue ?? 0,
    values: refSolution?.values ?? {},
    duals: refSolution?.duals ?? {},
    reducedCosts: refSolution?.reducedCosts ?? {},
    slacks: refSolution?.slacks ?? {},
  });

  const modelBuildSamples = [];
  const validationSamples = [];
  const lpSerializationSamples = [];
  const resultMappingSamples = [];
  const warmWorkerSolveSamples = [];

  let lastStatus = coldChecked.status;
  let lastObjective = coldChecked.objectiveValue;
  let allValid = coldChecked.valid;
  let maxViolation = coldChecked.maxViolation;

  for (let i = 0; i < iterCount; i++) {
    const tb0 = performance.now();
    const m = build();
    const tb1 = performance.now();
    modelBuildSamples.push(tb1 - tb0);

    const tv0 = performance.now();
    api.validateModelIntegrity(m);
    const tv1 = performance.now();
    validationSamples.push(tv1 - tv0);

    const tlp0 = performance.now();
    api.generateLpString({
      name: m.name,
      sense: m.sense,
      objective: m.objectiveExpr,
      constraints: m.constraints,
      variables: m.variables,
    });
    const tlp1 = performance.now();
    lpSerializationSamples.push(tlp1 - tlp0);

    const mapModel = build();
    const tm0 = performance.now();
    await mapModel.solve(mockSolver);
    const tm1 = performance.now();
    resultMappingSamples.push(tm1 - tm0);

    // Construct warmModel BEFORE starting the worker solve timer so modelBuildMs is excluded
    const warmModel = build();
    const tw0 = performance.now();
    const warmStatus = await warmModel.solve({
      solver: "highs",
      useWorker: true,
      presolve: "on",
    });
    const tw1 = performance.now();
    const warmValidation = warmModel.validateSolution();
    const warmChecked = checkSolved({
      model: warmModel,
      status: warmStatus,
      objectiveValue: warmModel.objectiveValue,
      validation: warmValidation,
      expectedObjective: coldChecked.objectiveValue,
      contextLabel: `${scDef.scenarioId} (browser worker warm solve iteration ${i + 1})`,
    });
    warmWorkerSolveSamples.push(tw1 - tw0);
    lastStatus = warmChecked.status;
    lastObjective = warmChecked.objectiveValue;
    allValid = allValid && warmChecked.valid;
    maxViolation = Math.max(maxViolation, warmChecked.maxViolation);
  }

  return {
    scenarioId: scDef.scenarioId,
    description: scDef.description,
    coldSolveMs,
    status: lastStatus,
    objectiveValue: lastObjective,
    valid: allValid,
    maxViolation,
    modelSize: { ...size, lpStringBytes },
    modelBuildSamples,
    validationSamples,
    lpSerializationSamples,
    resultMappingSamples,
    warmWorkerSolveSamples,
  };
}

/**
 * Optional Browser Worker benchmark runner using headless Chromium (Playwright) against `dist/browser`.
 * Clearly separated from Node.js measurements because Browser Worker solves include
 * Worker lifecycle, structured-clone message passing, and separate-thread WASM execution.
 */
async function runBrowserWorkerBenchmarks({ iterations, versions, warmStartHints }) {
  const browserDistRoot = path.join(repoRoot, "dist/browser");
  const { chromium } = await import("playwright");
  const fixture = await mkdtemp(path.join(os.tmpdir(), "washi-bench-browser-"));
  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    try {
      const filePath =
        pathname === "/bench.html"
          ? path.join(fixture, "bench.html")
          : path.join(browserDistRoot, pathname.slice(1));
      const bytes = await readFile(filePath);
      const contentType = pathname.endsWith(".wasm")
        ? "application/wasm"
        : pathname.endsWith(".html")
          ? "text/html"
          : "text/javascript";
      res.setHeader("Content-Type", contentType);
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser = null;
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    await writeFile(
      path.join(fixture, "bench.html"),
      `<!doctype html><script type="module">
        import * as api from "${origin}/washi.js";
        window.washiApi = api;
      </script>`
    );

    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const chromiumVersion = browser.version();
    let userAgent = "unknown";

    const scenarioDefs = [
      {
        scenarioId: "small-lp",
        description:
          "Deterministic 24-variable, 18-constraint resource allocation LP (Browser Worker)",
        hints: null,
      },
      {
        scenarioId: "scheduling-mip",
        description:
          "Deterministic 315-variable, 231-constraint staff shift scheduling MIP (Browser Worker)",
        hints: null,
      },
      {
        scenarioId: "scheduling-mip-warm-start",
        description:
          "Rebuilt 315-variable shift scheduling MIP seeded with feasible primal initialValue hints (Browser Worker)",
        hints: warmStartHints,
      },
    ];

    const out = [];
    for (const scDef of scenarioDefs) {
      // Use a fresh browser context/page per scenario so the first solve always measures
      // a genuine cold Web Worker + WASM initialization.
      const context = await browser.newContext({ serviceWorkers: "block" });
      try {
        const page = await context.newPage();
        await page.goto(`${origin}/bench.html`);
        await page.waitForFunction(() => Boolean(window.washiApi));
        if (userAgent === "unknown") {
          userAgent = await page.evaluate(() => navigator.userAgent);
        }

        const r = await page.evaluate(
          async ({
            iterCount,
            scDef,
            buildSmallLpSource,
            buildSchedulingMipSource,
            countModelSizeSource,
            verifySolvedModelSource,
            executeBrowserScenarioSource,
          }) => {
            const api = window.washiApi;
            const makeSmallLp = new Function("api", `return (${buildSmallLpSource})(api);`);
            const makeSchedulingMip = new Function(
              "api",
              "hints",
              `return (${buildSchedulingMipSource})(api, hints);`
            );
            const getSize = new Function("model", `return (${countModelSizeSource})(model);`);
            const checkSolved = new Function(
              "arg",
              `return (${verifySolvedModelSource})(arg);`
            );
            const runScenario = new Function(
              "arg",
              `return (${executeBrowserScenarioSource})(arg);`
            );

            return await runScenario({
              api,
              scDef,
              iterCount,
              makeSmallLp,
              makeSchedulingMip,
              getSize,
              checkSolved,
            });
          },
          {
            iterCount: iterations,
            scDef,
            buildSmallLpSource: buildSmallLpModel.toString(),
            buildSchedulingMipSource: buildSchedulingMipModel.toString(),
            countModelSizeSource: countModelSize.toString(),
            verifySolvedModelSource: verifySolvedModel.toString(),
            executeBrowserScenarioSource: executeBrowserScenario.toString(),
          }
        );

        out.push({
          scenarioId: r.scenarioId,
          description: r.description,
          environment: "chromium-headless",
          browserVersion: chromiumVersion,
          playwrightVersion: versions.playwrightVersion,
          usesBrowserWorker: true,
          solver: {
            name: "highs",
            version: versions.highsVersion,
            options: { useWorker: true, presolve: "on" },
            serializationMode: "lp-string",
          },
          modelSize: r.modelSize,
          solution: {
            status: r.status,
            objectiveValue: r.objectiveValue,
            valid: r.valid,
            maxViolation: r.maxViolation,
          },
          coldStart: {
            runtimeCondition: "fresh-web-worker-and-wasm",
            browserWorkerColdSolveMs: r.coldSolveMs,
          },
          warmRepeated: {
            runtimeCondition: "reused-web-worker",
            iterations,
            phases: {
              modelBuildMs: summarizeSamples(r.modelBuildSamples),
              validationMs: summarizeSamples(r.validationSamples),
              lpSerializationMs: summarizeSamples(r.lpSerializationSamples),
              resultMappingMs: summarizeSamples(r.resultMappingSamples),
              browserWorkerWarmSolveMs: summarizeSamples(r.warmWorkerSolveSamples),
            },
          },
        });
      } finally {
        await context.close();
      }
    }

    return {
      scenarios: out,
      browserInfo: {
        name: "chromium-headless",
        version: chromiumVersion,
        playwrightVersion: versions.playwrightVersion,
        userAgent,
      },
    };
  } finally {
    if (browser) {
      await browser.close();
    }
    await new Promise((resolve) => server.close(resolve));
    await rm(fixture, { recursive: true, force: true });
  }
}

/**
 * Run the reproducible benchmark suite and return a structured report.
 */
export async function runBenchmarks(options = {}) {
  const iterations = validateIterations(options.iterations, "iterations");
  const includeBrowser = Boolean(
    options.includeBrowser ?? process.env.RUN_BENCH_BROWSER === "1"
  );
  const { api, glpk } = await loadWashiModules({
    includeBrowser,
    rebuild: options.rebuild,
  });
  const versions = readPackageVersions();
  const cpus = os.cpus();

  const results = [];

  // 1. Small LP — HiGHS (Node)
  results.push(
    await measureNodeScenario({
      scenarioId: "small-lp",
      description: "Deterministic 24-variable, 18-constraint resource allocation LP",
      buildModel: () => buildSmallLpModel(api),
      solverKey: "highs",
      solverVersion: versions.highsVersion,
      solverOptions: { presolve: "on" },
      serializationMode: "lp-string",
      coldCondition: "fresh-module-and-wasm-instance",
      resetRuntime: () => api.setHighsWasmUrl(null),
      initRuntime: () => api.getHighs(),
      api,
      iterations,
    })
  );

  // 2. Small LP — GLPK (Node)
  results.push(
    await measureNodeScenario({
      scenarioId: "small-lp",
      description: "Deterministic 24-variable, 18-constraint resource allocation LP",
      buildModel: () => buildSmallLpModel(api),
      solverKey: "glpk",
      solverVersion: versions.glpkVersion,
      solverOptions: { presolve: "on" },
      serializationMode: "symbol-maps",
      coldCondition: "fresh-module-and-wasm-instance",
      resetRuntime: () => glpk.resetGlpkCache(),
      initRuntime: () => glpk.getGlpk(),
      api,
      iterations,
    })
  );

  // 3. Representative Scheduling MIP — HiGHS cold/reused (Node)
  const schedulingHighsResult = await measureNodeScenario({
    scenarioId: "scheduling-mip",
    description: "Deterministic 315-variable, 231-constraint weekly staff shift scheduling MIP",
    buildModel: () => buildSchedulingMipModel(api, null),
    solverKey: "highs",
    solverVersion: versions.highsVersion,
    solverOptions: { presolve: "on" },
    serializationMode: "lp-string",
    coldCondition: "fresh-wasm-instance-after-cache-reset",
    resetRuntime: () => api.setHighsWasmUrl(null),
    initRuntime: () => api.getHighs(),
    api,
    iterations,
  });
  results.push(schedulingHighsResult);

  // 4. Representative Scheduling MIP — HiGHS rebuilt with primal initialValue warm start (Node)
  const warmStartHints = { ...schedulingHighsResult.solution.valuesSnapshot };
  results.push(
    await measureNodeScenario({
      scenarioId: "scheduling-mip-warm-start",
      description:
        "Rebuilt 315-variable shift scheduling MIP seeded with feasible primal initialValue hints",
      buildModel: () => buildSchedulingMipModel(api, warmStartHints),
      solverKey: "highs",
      solverVersion: versions.highsVersion,
      solverOptions: { presolve: "on" },
      serializationMode: "lp-string",
      coldCondition: "fresh-wasm-instance-after-cache-reset",
      resetRuntime: () => api.setHighsWasmUrl(null),
      initRuntime: () => api.getHighs(),
      api,
      iterations,
    })
  );

  // 5. Representative Scheduling MIP — GLPK (Node)
  results.push(
    await measureNodeScenario({
      scenarioId: "scheduling-mip",
      description: "Deterministic 315-variable, 231-constraint weekly staff shift scheduling MIP",
      buildModel: () => buildSchedulingMipModel(api, null),
      solverKey: "glpk",
      solverVersion: versions.glpkVersion,
      solverOptions: { presolve: "on" },
      serializationMode: "symbol-maps",
      coldCondition: "fresh-wasm-instance-after-cache-reset",
      resetRuntime: () => glpk.resetGlpkCache(),
      initRuntime: () => glpk.getGlpk(),
      api,
      iterations,
    })
  );

  // Strip internal valuesSnapshot from public report objects
  for (const r of results) {
    delete r.solution.valuesSnapshot;
  }

  let browserResults = [];
  let browserInfo = null;
  if (includeBrowser) {
    const browserRun = await runBrowserWorkerBenchmarks({
      iterations,
      versions,
      warmStartHints,
    });
    browserResults = browserRun.scenarios;
    browserInfo = browserRun.browserInfo;
  }

  return {
    benchmarkSuite: "@ohtaman/washi-reproducible-benchmarks",
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      cpuModel: cpus[0]?.model ?? "unknown",
      cpuCores: cpus.length,
      washiVersion: versions.washiVersion,
      solvers: {
        highs: versions.highsVersion,
        glpk: versions.glpkVersion,
      },
      browserWorkerIncluded: includeBrowser,
      browser: browserInfo,
    },
    measurementBoundaries: MEASUREMENT_BOUNDARIES,
    nodeScenarios: results,
    browserWorkerScenarios: browserResults,
  };
}

export function formatReportText(report) {
  const lines = [];
  lines.push("================================================================================");
  lines.push("WaSHI Reproducible Modeler & Solver Benchmarks");
  lines.push("================================================================================");
  const env = report.environment;
  lines.push(
    `Platform : ${env.platform}/${env.arch} (${env.osRelease}) | Node ${env.nodeVersion}`
  );
  lines.push(`CPU      : ${env.cpuModel} (${env.cpuCores} cores)`);
  lines.push(
    `Versions : @ohtaman/washi ${env.washiVersion} | highs ${env.solvers.highs} | glpk.js ${env.solvers.glpk}`
  );
  if (env.browser) {
    lines.push(
      `Browser  : ${env.browser.name} ${env.browser.version} (Playwright ${env.browser.playwrightVersion})`
    );
  }
  lines.push("");
  lines.push("Measurement Boundaries (measured directly; phases are never subtracted):");
  for (const [key, desc] of Object.entries(report.measurementBoundaries)) {
    lines.push(`  - ${key}: ${desc}`);
  }
  lines.push("");
  lines.push("--------------------------------------------------------------------------------");
  lines.push("Node.js In-Process WASM Measurements (usesBrowserWorker: false)");
  lines.push("--------------------------------------------------------------------------------");

  for (const sc of report.nodeScenarios) {
    const sz = sc.modelSize;
    const p = sc.warmRepeated.phases;
    lines.push(
      `\n[${sc.scenarioId}] solver=${sc.solver.name}@${sc.solver.version} options=${JSON.stringify(sc.solver.options)} usesBrowserWorker=${sc.usesBrowserWorker}`
    );
    lines.push(`  Description : ${sc.description}`);
    lines.push(
      `  Model Size  : ${sz.numVariables} vars (${sz.numContinuous} cont, ${sz.numInteger} int, ${sz.numBinary} bin), ${sz.numConstraints} constraints, ${sz.numNonZeros} nonzeros${sz.lpStringBytes !== null ? `, LP=${sz.lpStringBytes} bytes` : ""}`
    );
    lines.push(
      `  Solution    : status=${sc.solution.status}, objective=${sc.solution.objectiveValue}, valid=${sc.solution.valid}`
    );
    lines.push(
      `  Cold Start  : init=${sc.coldStart.coldRuntimeInitMs.toFixed(2)} ms | firstEndToEndSolve=${sc.coldStart.coldFirstSolveMs.toFixed(2)} ms (${sc.coldStart.runtimeCondition})`
    );
    lines.push(
      `  Warm Phases (${sc.warmRepeated.iterations} runs, ${sc.warmRepeated.runtimeCondition}) [median / mean / min..max ms]:`
    );
    const fmt = (stat) =>
      `${stat.medianMs.toFixed(3)} / ${stat.meanMs.toFixed(3)} (${stat.minMs.toFixed(3)}..${stat.maxMs.toFixed(3)}) ms`;
    lines.push(`    modelBuildMs      : ${fmt(p.modelBuildMs)}`);
    lines.push(`    validationMs      : ${fmt(p.validationMs)}`);
    if (p.lpSerializationMs) {
      lines.push(`    lpSerializationMs : ${fmt(p.lpSerializationMs)}`);
    }
    if (p.symbolMapMs) {
      lines.push(`    symbolMapMs       : ${fmt(p.symbolMapMs)}`);
    }
    lines.push(`    resultMappingMs   : ${fmt(p.resultMappingMs)}`);
    lines.push(`    adapterSolveMs    : ${fmt(p.adapterSolveMs)}`);
    lines.push(`    endToEndSolveMs   : ${fmt(p.endToEndSolveMs)}`);
  }

  if (report.browserWorkerScenarios.length > 0) {
    lines.push("");
    lines.push("--------------------------------------------------------------------------------");
    lines.push(
      "Browser Web Worker Measurements — Headless Chromium (usesBrowserWorker: true)"
    );
    lines.push(
      "Note: Separate execution environment from Node.js; includes Worker & postMessage boundary."
    );
    lines.push("--------------------------------------------------------------------------------");
    for (const bsc of report.browserWorkerScenarios) {
      const bsz = bsc.modelSize;
      const bp = bsc.warmRepeated.phases;
      const fmt = (stat) =>
        `${stat.medianMs.toFixed(3)} / ${stat.meanMs.toFixed(3)} (${stat.minMs.toFixed(3)}..${stat.maxMs.toFixed(3)}) ms`;
      lines.push(
        `\n[${bsc.scenarioId}] solver=${bsc.solver.name}@${bsc.solver.version} browser=chromium@${bsc.browserVersion} options=${JSON.stringify(bsc.solver.options)} usesBrowserWorker=${bsc.usesBrowserWorker}`
      );
      lines.push(`  Description : ${bsc.description}`);
      lines.push(
        `  Model Size  : ${bsz.numVariables} vars (${bsz.numContinuous} cont, ${bsz.numInteger} int, ${bsz.numBinary} bin), ${bsz.numConstraints} constraints, ${bsz.numNonZeros} nonzeros, LP=${bsz.lpStringBytes} bytes`
      );
      lines.push(
        `  Solution    : status=${bsc.solution.status}, objective=${bsc.solution.objectiveValue}, valid=${bsc.solution.valid}`
      );
      lines.push(
        `  Cold Start  : browserWorkerColdSolve=${bsc.coldStart.browserWorkerColdSolveMs.toFixed(2)} ms (${bsc.coldStart.runtimeCondition})`
      );
      lines.push(
        `  Warm Phases (${bsc.warmRepeated.iterations} runs, ${bsc.warmRepeated.runtimeCondition}) [median / mean / min..max ms]:`
      );
      lines.push(`    modelBuildMs             : ${fmt(bp.modelBuildMs)}`);
      lines.push(`    validationMs             : ${fmt(bp.validationMs)}`);
      lines.push(`    lpSerializationMs        : ${fmt(bp.lpSerializationMs)}`);
      lines.push(`    resultMappingMs          : ${fmt(bp.resultMappingMs)}`);
      lines.push(`    browserWorkerWarmSolveMs : ${fmt(bp.browserWorkerWarmSolveMs)}`);
    }
  } else {
    lines.push("");
    lines.push(
      "Tip: Pass --browser (or RUN_BENCH_BROWSER=1) to also measure Chromium Web Worker execution (usesBrowserWorker: true)."
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function parseCliArgs(argv, env = process.env) {
  let iterations = 5;
  let json = false;
  let includeBrowser = env.RUN_BENCH_BROWSER === "1";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--browser") {
      includeBrowser = true;
    } else if (arg.startsWith("--iterations=")) {
      const raw = arg.slice("--iterations=".length);
      iterations = validateIterations(raw, "--iterations");
    } else if (arg === "--iterations") {
      const next = argv[++i];
      iterations = validateIterations(next, "--iterations");
    } else {
      throw new Error(
        `Unknown CLI option: ${arg}. Supported options: --iterations=<N>, --json, --browser`
      );
    }
  }
  return { iterations, json, includeBrowser };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const cli = parseCliArgs(process.argv.slice(2));
  const report = await runBenchmarks({
    iterations: cli.iterations,
    includeBrowser: cli.includeBrowser,
  });
  if (cli.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReportText(report));
  }
}
