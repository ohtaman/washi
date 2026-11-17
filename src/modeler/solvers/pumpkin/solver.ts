import { BoolOp, BoolVar, type LogicElement } from "../../boolean-expr.js";
import { Constraint } from "../../constraint.js";
import { LinExpr } from "../../expression.js";
import { QuadExpr } from "../../quad-expr.js";
import { normalizeSense } from "../../types.js";
import type { Var } from "../../variable.js";
import { registerSolver } from "../registry.js";
import type {
  CheckModelData,
  SolveModelData,
  Solver,
  SolverCapabilities,
  SolverCheckResult,
  SolverOptions,
  SolverResult,
} from "../types.js";
import { getPumpkinWasmUrl, loadPumpkinRuntime, shouldUseWorker } from "./loader.js";
import {
  getSharedPumpkinWorkerClient,
  type PumpkinCheckResponsePayload,
  type PumpkinSolveResponsePayload,
} from "./worker-client.js";

/**
 * Keep domains, coefficients, and scaled bounds within [-(2^30 - 1), 2^30 - 1]
 * so signed 32-bit propagator arithmetic in Pumpkin never overflows.
 */
const SAFE_I32_LIMIT = 1_073_741_823;
const MAX_PROPAGATOR_MAGNITUDE = 2_147_483_646;

interface SerializedVar {
  name: string;
  lb: number;
  ub: number;
}

interface SerializedTerm {
  varIndex: number;
  coeff: number;
}

interface SerializedLinearConstraint {
  name: string;
  terms: SerializedTerm[];
  sense: "<=" | ">=" | "==";
  rhs: number;
}

type SerializedLogicNode =
  | { kind: "boolVar"; index: number }
  | { kind: "linear"; terms: SerializedTerm[]; sense: "<=" | ">=" | "=="; rhs: number }
  | { kind: "and"; children: SerializedLogicNode[] }
  | { kind: "or"; children: SerializedLogicNode[] }
  | { kind: "not"; child: SerializedLogicNode }
  | { kind: "implies"; left: SerializedLogicNode; right: SerializedLogicNode }
  | { kind: "xor"; children: SerializedLogicNode[] };

interface SerializedLogicalConstraint {
  name: string;
  expr: SerializedLogicNode;
}

function normalizeZero(n: number): number {
  return Object.is(n, -0) || n === 0 ? 0 : n;
}

function setOwnProperty<T>(record: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(record, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function validateSafeInt(val: number, context: string): number {
  if (typeof val !== "number" || Number.isNaN(val)) {
    throw new Error(`PumpkinSolver encountered non-finite numeric value in ${context}.`);
  }
  if (!Number.isFinite(val)) {
    throw new Error(
      `PumpkinSolver only supports bounded finite integers (${context}: got ${val}).`
    );
  }
  if (!Number.isInteger(val)) {
    throw new Error(`PumpkinSolver only supports integer values (${context}: got ${val}).`);
  }
  const norm = normalizeZero(val);
  if (norm < -SAFE_I32_LIMIT || norm > SAFE_I32_LIMIT) {
    throw new Error(
      `Value out of Pumpkin safe 32-bit integer range [-${SAFE_I32_LIMIT}, ${SAFE_I32_LIMIT}] (${context}: got ${norm}).`
    );
  }
  return norm;
}

function validateTimeLimitMs(timeLimit: unknown): number | null {
  if (timeLimit === undefined || timeLimit === Infinity) {
    return null;
  }
  if (typeof timeLimit !== "number" || Number.isNaN(timeLimit) || timeLimit < 0 || !Number.isFinite(timeLimit)) {
    throw new Error(
      `Invalid timeLimit (${String(timeLimit)}): expected a finite non-negative number of seconds.`
    );
  }
  if (timeLimit === 0) {
    return 0;
  }
  const ms = Math.round(timeLimit * 1000);
  if (ms > Number.MAX_SAFE_INTEGER) {
    throw new Error(`timeLimit (${timeLimit}s) exceeds safe millisecond range.`);
  }
  return Math.max(1, ms);
}

function isQuadraticExpr(expr: unknown): expr is QuadExpr {
  return expr instanceof QuadExpr || (typeof expr === "object" && expr !== null && "quadTerms" in expr);
}

function serializeVariables(variables: Var[]): {
  vars: SerializedVar[];
  varIndexMap: Map<Var, number>;
  hasEmptyDomain: boolean;
} {
  const vars: SerializedVar[] = [];
  const varIndexMap = new Map<Var, number>();
  let hasEmptyDomain = false;

  for (let i = 0; i < variables.length; i++) {
    const v = variables[i];
    const normType = String(v.type).toLowerCase();
    if (normType === "continuous" || normType === "cont") {
      throw new Error(
        `PumpkinSolver does not support Continuous variable "${v.name}". Use an Integer or Binary variable, or select a MIP/SMT solver.`
      );
    }
    if (v.initialValue !== undefined) {
      throw new Error(
        `Solver "pumpkin" does not support primal initial values (initialValue) on variable "${v.name}". Please use a solver with warm-start support such as HiGHS.`
      );
    }

    varIndexMap.set(v, i);
    const isBinary = normType === "binary" || normType === "bin";
    if (isBinary) {
      if (
        typeof v.lb !== "number" ||
        Number.isNaN(v.lb) ||
        typeof v.ub !== "number" ||
        Number.isNaN(v.ub)
      ) {
        throw new Error(
          `PumpkinSolver encountered non-finite numeric value in bounds of variable "${v.name}".`
        );
      }
      if (v.lb === Infinity || v.ub === -Infinity || v.lb > v.ub) {
        throw new Error(
          `Variable "${v.name}" has invalid bounds lb (${v.lb}) > ub (${v.ub}).`
        );
      }
      if (
        (Number.isFinite(v.lb) && !Number.isInteger(v.lb)) ||
        (Number.isFinite(v.ub) && !Number.isInteger(v.ub))
      ) {
        throw new Error(
          `PumpkinSolver only supports integer values (bounds of binary variable "${v.name}").`
        );
      }
      const effLb = v.lb === -Infinity ? 0 : Math.max(0, normalizeZero(v.lb));
      const effUb = v.ub === Infinity ? 1 : Math.min(1, normalizeZero(v.ub));
      if (effLb > effUb) {
        hasEmptyDomain = true;
        vars.push({ name: v.name, lb: 0, ub: 1 });
      } else {
        vars.push({ name: v.name, lb: effLb, ub: effUb });
      }
      continue;
    }

    const lb = validateSafeInt(v.lb, `lower bound of variable "${v.name}"`);
    const ub = validateSafeInt(v.ub, `upper bound of variable "${v.name}"`);
    if (lb > ub) {
      throw new Error(
        `Variable "${v.name}" has invalid bounds lb (${lb}) > ub (${ub}).`
      );
    }
    vars.push({ name: v.name, lb, ub });
  }

  return { vars, varIndexMap, hasEmptyDomain };
}

function serializeLinearTerms(
  expr: LinExpr,
  varIndexMap: Map<Var, number>,
  vars: SerializedVar[],
  context: string
): { terms: SerializedTerm[]; sumMaxAbs: number } {
  const coeffByVar = new Map<number, number>();
  for (const [termVar, termCoeff] of expr.terms.entries()) {
    const varIndex = varIndexMap.get(termVar);
    if (varIndex === undefined) {
      throw new Error(`Variable "${termVar.name}" in ${context} is not registered in the model.`);
    }
    if (typeof termCoeff !== "number" || !Number.isFinite(termCoeff)) {
      throw new Error(`Invalid non-finite coefficient for "${termVar.name}" in ${context}.`);
    }
    if (!Number.isInteger(termCoeff)) {
      throw new Error(
        `PumpkinSolver only supports integer coefficients (variable "${termVar.name}" in ${context} has ${termCoeff}).`
      );
    }
    const next = (coeffByVar.get(varIndex) ?? 0) + normalizeZero(termCoeff);
    if (!Number.isSafeInteger(next)) {
      throw new Error(`Coefficient sum overflow for "${termVar.name}" in ${context}.`);
    }
    coeffByVar.set(varIndex, next);
  }

  const terms: SerializedTerm[] = [];
  let sumMaxAbs = 0;

  for (const [varIndex, rawCoeff] of coeffByVar.entries()) {
    const coeff = normalizeZero(rawCoeff);
    if (coeff === 0) {
      continue;
    }
    const vSpec = vars[varIndex];
    validateSafeInt(coeff, `coefficient of "${vSpec.name}" in ${context}`);
    const prodLb = coeff * vSpec.lb;
    const prodUb = coeff * vSpec.ub;
    validateSafeInt(prodLb, `scaled lower bound of "${vSpec.name}" in ${context}`);
    validateSafeInt(prodUb, `scaled upper bound of "${vSpec.name}" in ${context}`);

    sumMaxAbs += Math.max(Math.abs(prodLb), Math.abs(prodUb));
    if (sumMaxAbs > MAX_PROPAGATOR_MAGNITUDE) {
      throw new Error(
        `Linear expression magnitude in ${context} exceeds Pumpkin safe 32-bit propagator overflow limit.`
      );
    }
    terms.push({ varIndex, coeff });
  }

  return { terms, sumMaxAbs };
}

function serializeLinearConstraintTerms(
  lhs: LinExpr,
  rhs: number,
  varIndexMap: Map<Var, number>,
  vars: SerializedVar[],
  context: string
): { terms: SerializedTerm[]; rhs: number } {
  if (typeof lhs.constant !== "number" || !Number.isFinite(lhs.constant) || !Number.isFinite(rhs)) {
    throw new Error(`Invalid non-finite constant/RHS in ${context}.`);
  }
  const adjustedRhs = normalizeZero(rhs - lhs.constant);
  const safeRhs = validateSafeInt(adjustedRhs, `RHS of ${context}`);
  const { terms, sumMaxAbs } = serializeLinearTerms(lhs, varIndexMap, vars, context);

  if (Math.abs(safeRhs) + sumMaxAbs > MAX_PROPAGATOR_MAGNITUDE) {
    throw new Error(
      `Linear expression magnitude in ${context} exceeds Pumpkin safe 32-bit propagator overflow limit.`
    );
  }

  return { terms, rhs: safeRhs };
}

function serializeLogicNode(
  node: LogicElement,
  varIndexMap: Map<Var, number>,
  vars: SerializedVar[],
  boolVarIndexMap: Map<BoolVar, number>,
  context: string
): SerializedLogicNode {
  if (
    boolVarIndexMap.has(node as BoolVar) ||
    node instanceof BoolVar ||
    (typeof node === "object" &&
      node !== null &&
      "name" in node &&
      "id" in node &&
      !("op" in node) &&
      !("lhs" in node))
  ) {
    const bvNode = node as BoolVar;
    const index = boolVarIndexMap.get(bvNode);
    if (index === undefined) {
      throw new Error(`Boolean variable "${bvNode.name}" in ${context} is not registered in the model.`);
    }
    return { kind: "boolVar", index };
  }

  if (node instanceof Constraint || ("lhs" in node && "sense" in node && "rhs" in node)) {
    const cNode = node as Constraint;
    if (isQuadraticExpr(cNode.lhs)) {
      throw new Error(
        `PumpkinSolver does not support quadratic constraints inside ${context}.`
      );
    }
    const { terms, rhs } = serializeLinearConstraintTerms(
      cNode.lhs as LinExpr,
      cNode.rhs,
      varIndexMap,
      vars,
      context
    );
    return { kind: "linear", terms, sense: cNode.sense, rhs };
  }

  if (node instanceof BoolOp || ("op" in node && "children" in node)) {
    const opNode = node as BoolOp;
    switch (opNode.op) {
      case "and":
        return {
          kind: "and",
          children: opNode.children.map((c) =>
            serializeLogicNode(c, varIndexMap, vars, boolVarIndexMap, context)
          ),
        };
      case "or":
        return {
          kind: "or",
          children: opNode.children.map((c) =>
            serializeLogicNode(c, varIndexMap, vars, boolVarIndexMap, context)
          ),
        };
      case "not":
        if (opNode.children.length !== 1) {
          throw new Error(`Invalid 'not' operator arity in ${context}.`);
        }
        return {
          kind: "not",
          child: serializeLogicNode(opNode.children[0], varIndexMap, vars, boolVarIndexMap, context),
        };
      case "implies":
        if (opNode.children.length !== 2) {
          throw new Error(`Invalid 'implies' operator arity in ${context}.`);
        }
        return {
          kind: "implies",
          left: serializeLogicNode(opNode.children[0], varIndexMap, vars, boolVarIndexMap, context),
          right: serializeLogicNode(opNode.children[1], varIndexMap, vars, boolVarIndexMap, context),
        };
      case "xor":
        return {
          kind: "xor",
          children: opNode.children.map((c) =>
            serializeLogicNode(c, varIndexMap, vars, boolVarIndexMap, context)
          ),
        };
      default:
        throw new Error(
          `Unsupported logical operator "${String((opNode as { op?: unknown }).op)}" in ${context}.`
        );
    }
  }

  throw new Error(`Unsupported logical constraint node in ${context}.`);
}

function serializeCommonModel(modelData: CheckModelData): {
  vars: SerializedVar[];
  boolVars: string[];
  constraints: SerializedLinearConstraint[];
  logicalConstraints: SerializedLogicalConstraint[];
  varIndexMap: Map<Var, number>;
  hasEmptyDomain: boolean;
} {
  const { vars, varIndexMap, hasEmptyDomain } = serializeVariables(modelData.variables);

  const boolVarsList = modelData.boolVars ?? [];
  const boolVarIndexMap = new Map<BoolVar, number>();
  const boolVars: string[] = [];
  for (let i = 0; i < boolVarsList.length; i++) {
    boolVarIndexMap.set(boolVarsList[i], i);
    boolVars.push(boolVarsList[i].name);
  }

  const constraints: SerializedLinearConstraint[] = [];
  for (const c of modelData.constraints) {
    const context = `constraint "${c.name}"`;
    if (isQuadraticExpr(c.lhs)) {
      throw new Error(`PumpkinSolver does not support quadratic constraints (${context}).`);
    }
    const { terms, rhs } = serializeLinearConstraintTerms(
      c.lhs as LinExpr,
      c.rhs,
      varIndexMap,
      vars,
      context
    );
    constraints.push({ name: c.name, terms, sense: c.sense, rhs });
  }

  const logicalConstraints: SerializedLogicalConstraint[] = [];
  for (const lc of modelData.logicalConstraints ?? []) {
    const context = `logical constraint "${lc.name}"`;
    const expr = serializeLogicNode(lc.expr, varIndexMap, vars, boolVarIndexMap, context);
    logicalConstraints.push({ name: lc.name, expr });
  }

  return { vars, boolVars, constraints, logicalConstraints, varIndexMap, hasEmptyDomain };
}

function tuplesToValuesRecord(
  valuesTuples?: Array<[string, number]>,
  boolTuples?: Array<[string, boolean]>,
  includeBoolNumeric?: boolean
): { values: Record<string, number>; boolValues?: Record<string, boolean> } {
  const values: Record<string, number> = {};
  if (valuesTuples) {
    for (const [name, val] of valuesTuples) {
      setOwnProperty(values, name, normalizeZero(val));
    }
  }
  let boolValues: Record<string, boolean> | undefined;
  if (boolTuples && boolTuples.length > 0) {
    boolValues = {};
    for (const [name, val] of boolTuples) {
      setOwnProperty(boolValues, name, val);
      if (includeBoolNumeric) {
        setOwnProperty(values, name, val ? 1 : 0);
      }
    }
  }
  return { values, ...(boolValues !== undefined ? { boolValues } : {}) };
}

function tuplesToCheckValues(
  valuesTuples?: Array<[string, number]>,
  boolTuples?: Array<[string, boolean]>
): Record<string, number | boolean> {
  const values: Record<string, number | boolean> = {};
  if (valuesTuples) {
    for (const [name, val] of valuesTuples) {
      setOwnProperty(values, name, normalizeZero(val));
    }
  }
  if (boolTuples) {
    for (const [name, val] of boolTuples) {
      setOwnProperty(values, name, val);
    }
  }
  return values;
}

function resolveEffectiveWasmUrl(options: SolverOptions): string | null {
  if (options.wasmUrl !== undefined && options.wasmUrl !== null && typeof options.wasmUrl !== "string") {
    throw new Error(
      `Invalid pumpkin.wasm URL: expected string, got ${typeof options.wasmUrl}.`
    );
  }
  return typeof options.wasmUrl === "string" && options.wasmUrl !== ""
    ? options.wasmUrl
    : getPumpkinWasmUrl();
}

/**
 * Pumpkin WebAssembly Lazy Clause Generation (LCG) Solver adapter for WaSHI.
 *
 * Supports bounded integer and binary variables, integer linear constraints,
 * native propositional/logical constraints (`BoolVar`, `and`, `or`, `not`, `implies`, `xor`),
 * `Unsat` core conflict extraction in `check()`, incumbent progress streaming, and `AbortSignal`.
 */
export class PumpkinSolver implements Solver {
  readonly name = "pumpkin";
  readonly options: SolverOptions;
  readonly capabilities: SolverCapabilities = {
    supportsMIP: true,
    supportsQP: false,
    supportsQCQP: false,
    supportsSMT: false,
    supportsLogicalConstraints: true,
    supportsUnsatCore: true,
    supportsWarmStart: false,
  };

  constructor(options: SolverOptions = {}) {
    this.options = options;
  }

  async check(
    modelData: CheckModelData,
    options: SolverOptions = {}
  ): Promise<SolverCheckResult> {
    const mergedOptions: SolverOptions = { ...this.options, ...options };
    const effectiveWasmUrl = resolveEffectiveWasmUrl(mergedOptions);
    const timeLimitMs = validateTimeLimitMs(mergedOptions.timeLimit);
    const common = serializeCommonModel(modelData);

    if (mergedOptions.signal?.aborted) {
      return {
        status: "Unknown",
        values: {},
        runTime: 0,
      };
    }

    if (common.hasEmptyDomain) {
      return {
        status: "Unsat",
        values: {},
        unsatCore: [],
        conflicts: [],
        runTime: 1e-6,
      };
    }

    const requestJson = JSON.stringify({
      vars: common.vars,
      boolVars: common.boolVars,
      constraints: common.constraints,
      logicalConstraints: common.logicalConstraints,
      timeLimitMs,
    });

    const useWorker = mergedOptions.useWorker ?? shouldUseWorker();
    let payload: PumpkinCheckResponsePayload;

    if (useWorker) {
      const client = getSharedPumpkinWorkerClient();
      payload = await client.check(
        { requestJson, wasmUrl: effectiveWasmUrl },
        { signal: mergedOptions.signal }
      );
    } else {
      const runtime = await loadPumpkinRuntime(effectiveWasmUrl);
      if (mergedOptions.signal?.aborted) {
        return {
          status: "Unknown",
          values: {},
          runTime: 0,
        };
      }
      const startMs = performance.now();
      const rawJson = runtime.check_with_callback(requestJson, () =>
        Boolean(mergedOptions.signal?.aborted)
      );
      const runTime = Math.max((performance.now() - startMs) / 1000, 1e-6);
      payload = JSON.parse(rawJson) as PumpkinCheckResponsePayload;
      payload.runTime = runTime;
      if (payload.error) {
        throw new Error(payload.error);
      }
    }

    const runTime = payload.runTime ?? 0;
    if (payload.status === "Sat") {
      return {
        status: "Sat",
        values: tuplesToCheckValues(payload.values, payload.boolValues),
        runTime,
      };
    }
    if (payload.status === "Unsat") {
      const core = payload.unsatCore ? [...payload.unsatCore] : [];
      return {
        status: "Unsat",
        values: {},
        unsatCore: core,
        conflicts: core,
        runTime,
      };
    }
    return {
      status: "Unknown",
      values: {},
      runTime,
    };
  }

  async solve(
    modelData: SolveModelData,
    options: SolverOptions = {}
  ): Promise<SolverResult> {
    const mergedOptions: SolverOptions = { ...this.options, ...options };
    if (mergedOptions.relax === true) {
      throw new Error(
        "PumpkinSolver does not support LP relaxation (relax: true). Use a simplex/IPM solver such as HiGHS or GLPK."
      );
    }

    const effectiveWasmUrl = resolveEffectiveWasmUrl(mergedOptions);
    const timeLimitMs = validateTimeLimitMs(mergedOptions.timeLimit);
    const sense = normalizeSense(modelData.sense);
    const common = serializeCommonModel(modelData);

    if (isQuadraticExpr(modelData.objective)) {
      throw new Error(
        "PumpkinSolver does not support quadratic objective expressions (QuadExpr). Use a QP solver such as HiGHS."
      );
    }
    const objExpr = modelData.objective as LinExpr;
    if (typeof objExpr.constant !== "number" || !Number.isFinite(objExpr.constant)) {
      throw new Error("Invalid non-finite objective constant.");
    }
    const objectiveConstant = normalizeZero(objExpr.constant);
    const { terms: objectiveTerms, sumMaxAbs: objMaxAbs } = serializeLinearTerms(
      objExpr,
      common.varIndexMap,
      common.vars,
      "objective expression"
    );
    if (objMaxAbs > SAFE_I32_LIMIT) {
      throw new Error(
        `Objective expression magnitude (${objMaxAbs}) exceeds Pumpkin safe 32-bit integer range [-${SAFE_I32_LIMIT}, ${SAFE_I32_LIMIT}].`
      );
    }

    if (mergedOptions.signal?.aborted) {
      return {
        status: "Unknown",
        terminationStatus: "Interrupted",
        hasPrimalSolution: false,
        objectiveValue: null,
        values: {},
        runTime: 0,
      };
    }

    if (common.hasEmptyDomain) {
      return {
        status: "Infeasible",
        terminationStatus: "Infeasible",
        hasPrimalSolution: false,
        objectiveValue: null,
        values: {},
        runTime: 1e-6,
      };
    }

    const requestJson = JSON.stringify({
      vars: common.vars,
      boolVars: common.boolVars,
      constraints: common.constraints,
      logicalConstraints: common.logicalConstraints,
      sense,
      objectiveTerms,
      objectiveConstant,
      timeLimitMs,
    });

    const useWorker = mergedOptions.useWorker ?? shouldUseWorker();
    const userOnProgress = mergedOptions.onProgress;
    let progressCount = 0;
    const trackedOnProgress = userOnProgress
      ? (ev: Parameters<NonNullable<SolverOptions["onProgress"]>>[0]) => {
          progressCount++;
          userOnProgress(ev);
        }
      : undefined;

    let payload: PumpkinSolveResponsePayload;

    if (useWorker) {
      const client = getSharedPumpkinWorkerClient();
      payload = await client.solve(
        { requestJson, wasmUrl: effectiveWasmUrl },
        {
          signal: mergedOptions.signal,
          onProgress: trackedOnProgress,
        }
      );
    } else {
      const runtime = await loadPumpkinRuntime(effectiveWasmUrl);
      if (mergedOptions.signal?.aborted) {
        return {
          status: "Unknown",
          terminationStatus: "Interrupted",
          hasPrimalSolution: false,
          objectiveValue: null,
          values: {},
          runTime: 0,
        };
      }

      const startMs = performance.now();
      let callbackError: unknown = null;
      const signal = mergedOptions.signal;

      const onEvent = trackedOnProgress
        ? (incumbentJson: string): boolean => {
            try {
              const inc = JSON.parse(incumbentJson) as { objectiveValue?: number };
              const elapsedTime = Math.max((performance.now() - startMs) / 1000, 1e-6);
              trackedOnProgress({
                elapsedTime,
                elapsedSeconds: elapsedTime,
                objectiveValue: inc.objectiveValue,
              });
              return Boolean(signal?.aborted);
            } catch (err) {
              callbackError = err;
              return true;
            }
          }
        : null;

      const shouldAbort = signal ? (): boolean => Boolean(signal.aborted) : null;
      const rawJson = runtime.solve_with_callback(requestJson, onEvent, shouldAbort);

      if (callbackError !== null) {
        throw callbackError;
      }

      const runTime = Math.max((performance.now() - startMs) / 1000, 1e-6);
      payload = JSON.parse(rawJson) as PumpkinSolveResponsePayload;
      payload.runTime = runTime;
      if (payload.error) {
        throw new Error(payload.error);
      }
    }

    const hasPrimal = payload.status === "Optimal" || payload.status === "Feasible";
    const objectiveValue =
      typeof payload.objectiveValue === "number" ? normalizeZero(payload.objectiveValue) : null;
    const runTime = payload.runTime ?? 0;

    if (hasPrimal && progressCount === 0 && trackedOnProgress) {
      trackedOnProgress({
        elapsedTime: runTime,
        elapsedSeconds: runTime,
        ...(objectiveValue !== null ? { objectiveValue } : {}),
      });
    }

    const mapped = hasPrimal
      ? tuplesToValuesRecord(payload.values, payload.boolValues, true)
      : { values: {} };

    return {
      status: payload.status,
      terminationStatus: payload.terminationStatus as SolverResult["terminationStatus"],
      hasPrimalSolution: hasPrimal,
      objectiveValue,
      values: mapped.values,
      ...(mapped.boolValues !== undefined ? { boolValues: mapped.boolValues } : {}),
      runTime,
    };
  }
}

/**
 * Registers the Pumpkin WebAssembly LCG solver under `"pumpkin"` in the WaSHI solver registry.
 */
export function registerPumpkinSolver(defaultOptions?: SolverOptions): void {
  registerSolver("pumpkin", (opts) => new PumpkinSolver(opts ?? defaultOptions));
}

registerPumpkinSolver();
