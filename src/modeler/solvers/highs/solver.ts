import type { Solver, SolverOptions, SolverResult, SolveModelData } from "../types.js";
import {
  generateLpString,
  isLpExportResult,
  sanitizeIdentifier,
  type LpModelData,
  type LpExportResult,
} from "../../lp-writer.js";
import type { SolverStatus, TerminationStatus } from "../../types.js";
import { normalizeVarInitialValue, validateVarBounds } from "../../validation.js";
import { solveLp } from "./worker-client.js";

/**
 * Map a raw HiGHS model status string or status code to WaSHI's standardized TerminationStatus.
 */
export function mapHighsTerminationStatus(
  rawStatus: unknown,
  statusCode?: number
): TerminationStatus {
  if (typeof statusCode === "number") {
    switch (statusCode) {
      case 0:
        return "NotSolved";
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
        return "Error";
      case 6:
        return "Unknown";
      case 7:
        return "Optimal";
      case 8:
        return "Infeasible";
      case 9:
        return "InfeasibleOrUnbounded";
      case 10:
        return "Unbounded";
      case 11:
        return "ObjectiveBound";
      case 12:
        return "ObjectiveTarget";
      case 13:
        return "TimeLimit";
      case 14:
        return "IterationLimit";
      case 15:
        return "Unknown";
      case 16:
        return "SolutionLimit";
      case 17:
        return "Interrupted";
      case 18:
        return "MemoryLimit";
    }
  }

  if (typeof rawStatus !== "string") {
    return "Unknown";
  }
  const normalized = rawStatus.trim();
  if (!normalized) {
    return "Unknown";
  }

  switch (normalized) {
    case "Optimal":
      return "Optimal";
    case "Infeasible":
      return "Infeasible";
    case "Unbounded":
      return "Unbounded";
    case "Primal infeasible or unbounded":
    case "InfeasibleOrUnbounded":
      return "InfeasibleOrUnbounded";
    case "Time limit reached":
    case "TimeLimit":
      return "TimeLimit";
    case "Iteration limit reached":
    case "IterationLimit":
      return "IterationLimit";
    case "Solution limit reached":
    case "SolutionLimit":
      return "SolutionLimit";
    case "Memory limit reached":
    case "MemoryLimit":
      return "MemoryLimit";
    case "Bound on objective reached":
    case "ObjectiveBound":
      return "ObjectiveBound";
    case "Target for objective reached":
    case "ObjectiveTarget":
      return "ObjectiveTarget";
    case "Interrupted":
    case "User interrupt":
      return "Interrupted";
    case "Feasible":
      return "Feasible";
    case "Not Set":
      return "NotSolved";
    case "Load error":
    case "Model error":
    case "Presolve error":
    case "Solve error":
    case "Postsolve error":
    case "Error":
      return "Error";
    case "Empty":
    case "Unknown":
      return "Unknown";
  }

  const lower = normalized.toLowerCase();
  if (lower.includes("infeasible") && lower.includes("unbounded")) {
    return "InfeasibleOrUnbounded";
  }
  if (lower.includes("infeasible")) {
    return "Infeasible";
  }
  if (lower.includes("unbounded")) {
    return "Unbounded";
  }
  if (lower.includes("time limit") || lower.includes("timelimit")) {
    return "TimeLimit";
  }
  if (lower.includes("iteration limit") || lower.includes("iterationlimit")) {
    return "IterationLimit";
  }
  if (lower.includes("solution limit") || lower.includes("solutionlimit")) {
    return "SolutionLimit";
  }
  if (lower.includes("memory limit") || lower.includes("memorylimit")) {
    return "MemoryLimit";
  }
  if (lower.includes("bound on objective")) {
    return "ObjectiveBound";
  }
  if (lower.includes("target for objective")) {
    return "ObjectiveTarget";
  }
  if (lower.includes("interrupt")) {
    return "Interrupted";
  }
  if (lower.includes("error")) {
    return "Error";
  }
  if (lower === "optimal") {
    return "Optimal";
  }

  return "Unknown";
}

/**
 * Map a raw HiGHS model status string to WaSHI's standardized SolverStatus.
 * Only verified optimality maps to "Optimal"; missing or unrecognized statuses map to "Unknown".
 */
export function mapHighsStatus(
  rawStatus: unknown,
  statusCode?: number,
  hasPrimalSolution?: boolean
): SolverStatus {
  const term = mapHighsTerminationStatus(rawStatus, statusCode);
  switch (term) {
    case "Optimal":
      return "Optimal";
    case "Infeasible":
      return "Infeasible";
    case "Unbounded":
      return "Unbounded";
    case "TimeLimit":
      return "TimeLimit";
    case "IterationLimit":
      return "IterationLimit";
    case "Feasible":
      return "Feasible";
    case "ObjectiveBound":
    case "ObjectiveTarget":
    case "SolutionLimit":
      return hasPrimalSolution === false ? "Unknown" : "Feasible";
    case "MemoryLimit":
    case "Interrupted":
      return hasPrimalSolution ? "Feasible" : "Unknown";
    case "NotSolved":
      return "NotSolved";
    case "Error":
      return "Error";
    default:
      return "Unknown";
  }
}

/**
 * HiGHS Solver adapter (WebAssembly in Browser / Node.js)
 * High-performance simplex / interior point / branch-and-cut solver.
 */
export class HighsSolver implements Solver {
  public static readonly capabilities = {
    supportsMIP: true,
    supportsQP: true,
    supportsWarmStart: true,
  };
  public readonly name = "HiGHS";
  public readonly version = "1.15.3";
  public readonly capabilities = HighsSolver.capabilities;
  public options: SolverOptions;

  constructor(options: SolverOptions = {}) {
    this.options = options;
  }

  solve(modelData: SolveModelData, options?: SolverOptions): Promise<SolverResult>;
  solve(
    modelData: LpModelData,
    lpResult: LpExportResult,
    options?: SolverOptions
  ): Promise<SolverResult>;
  async solve(
    modelData: SolveModelData,
    optionsOrLpResult: SolverOptions | LpExportResult = {},
    maybeOptions: SolverOptions = {}
  ): Promise<SolverResult> {
    const hasExplicitLp = isLpExportResult(optionsOrLpResult);
    const options: SolverOptions = hasExplicitLp ? maybeOptions : optionsOrLpResult;
    const mergedOptions: SolverOptions = { ...this.options, ...options };
    const offset = modelData.objective.constant || 0;

    for (const v of modelData.variables) {
      validateVarBounds(v);
    }

    const lpResult: LpExportResult = hasExplicitLp
      ? optionsOrLpResult
      : generateLpString(modelData);
    const { lpString, nameToVar, nameToConstraint } = lpResult;

    const initialValues: Record<string, number> = Object.create(null);
    let hasInitialValues = false;
    const mappedVars = new Set<any>();
    for (const [colName, v] of nameToVar.entries()) {
      mappedVars.add(v);
      const normalized = normalizeVarInitialValue(v);
      if (normalized !== undefined) {
        initialValues[colName] = normalized;
        hasInitialValues = true;
      }
    }
    for (let i = 0; i < modelData.variables.length; i++) {
      const v = modelData.variables[i];
      if (!mappedVars.has(v)) {
        const normalized = normalizeVarInitialValue(v);
        if (normalized !== undefined) {
          const fallbackName = sanitizeIdentifier(v.name, "x", i);
          if (!Object.prototype.hasOwnProperty.call(initialValues, fallbackName)) {
            initialValues[fallbackName] = normalized;
            hasInitialValues = true;
          }
        }
      }
    }

    let effectiveOptions: SolverOptions = mergedOptions;
    if (offset !== 0 || hasInitialValues || effectiveOptions.initialValues !== undefined) {
      effectiveOptions = {
        ...effectiveOptions,
        ...(offset !== 0 ? { objectiveOffset: offset } : {}),
        initialValues: hasInitialValues ? initialValues : undefined,
      };
    }

    const { result, runTime } = await solveLp(lpString, effectiveOptions);
    const remainingOffset = result?.ObjectiveOffsetApplied ? 0 : offset;

    const terminationStatus = mapHighsTerminationStatus(result?.Status, result?.StatusCode);
    const isMip =
      typeof result?.IsMip === "boolean"
        ? result.IsMip
        : modelData.variables.some((v) => v.type === "Integer" || v.type === "Binary");

    let hasPrimalSolution: boolean;
    if (typeof result?.HasPrimalSolution === "boolean") {
      hasPrimalSolution = result.HasPrimalSolution;
    } else {
      const colEntries = result?.Columns ? Object.values(result.Columns) : [];
      const anyFinitePrimal =
        colEntries.length > 0
          ? colEntries.some((c: any) => typeof c?.Primal === "number" && Number.isFinite(c.Primal))
          : false;
      const finiteRawObj =
        typeof result?.ObjectiveValue === "number" && Number.isFinite(result.ObjectiveValue);
      if (
        terminationStatus === "Infeasible" ||
        terminationStatus === "Unbounded" ||
        terminationStatus === "InfeasibleOrUnbounded" ||
        terminationStatus === "Error" ||
        terminationStatus === "NotSolved"
      ) {
        hasPrimalSolution = false;
      } else if (terminationStatus === "Optimal" || terminationStatus === "Feasible") {
        hasPrimalSolution = finiteRawObj || anyFinitePrimal;
      } else {
        hasPrimalSolution = finiteRawObj && (colEntries.length === 0 || anyFinitePrimal);
      }
    }

    const status = mapHighsStatus(result?.Status, result?.StatusCode, hasPrimalSolution);

    let objectiveValue: number | null = null;
    if (hasPrimalSolution && typeof result?.ObjectiveValue === "number" && Number.isFinite(result.ObjectiveValue)) {
      objectiveValue = result.ObjectiveValue + remainingOffset;
    }

    let objectiveBound: number | undefined;
    let relGap: number | undefined;
    let absGap: number | undefined;

    if (typeof result?.MipDualBound === "number" && Number.isFinite(result.MipDualBound)) {
      objectiveBound = result.MipDualBound + remainingOffset;
    } else if (!isMip && terminationStatus === "Optimal" && objectiveValue !== null) {
      objectiveBound = objectiveValue;
    }

    if (objectiveValue !== null && objectiveBound !== undefined && Number.isFinite(objectiveBound)) {
      absGap = Math.abs(objectiveValue - objectiveBound);
    }

    if (remainingOffset !== 0 && isMip && objectiveValue !== null && objectiveBound !== undefined && absGap !== undefined) {
      if (absGap === 0) {
        relGap = 0;
      } else if (Math.abs(objectiveValue) > 0) {
        const shiftedGap = absGap / Math.abs(objectiveValue);
        relGap = Number.isFinite(shiftedGap) ? shiftedGap : undefined;
      } else {
        relGap = undefined;
      }
    } else if (typeof result?.MipGap === "number" && Number.isFinite(result.MipGap)) {
      relGap = result.MipGap;
    } else if (isMip && terminationStatus === "Optimal" && hasPrimalSolution && (absGap === undefined || absGap === 0)) {
      relGap = 0;
    }

    if (!hasPrimalSolution) {
      return {
        status,
        terminationStatus,
        hasPrimalSolution: false,
        objectiveValue: null,
        ...(objectiveBound !== undefined ? { objectiveBound } : {}),
        ...(relGap !== undefined ? { relGap, mipGap: relGap } : {}),
        ...(absGap !== undefined ? { absGap } : {}),
        values: {},
        reducedCosts: {},
        duals: {},
        slacks: {},
        runTime,
        raw: result,
      };
    }

    const setOwnProperty = (record: Record<string, number>, key: string, value: number) => {
      Object.defineProperty(record, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    };

    const valuesRecord: Record<string, number> = {};
    const dualsRecord: Record<string, number> = {};
    const reducedCostsRecord: Record<string, number> = {};
    const slacksRecord: Record<string, number> = {};

    if (result.Columns) {
      for (const [colName, colData] of Object.entries(result.Columns)) {
        const v = nameToVar.get(colName);
        if (v) {
          if (typeof colData.Primal === "number" && Number.isFinite(colData.Primal)) {
            const primal = Math.abs(colData.Primal) < 1e-9 ? 0 : colData.Primal;
            setOwnProperty(valuesRecord, v.name, primal);
          }
          if (typeof colData.Dual === "number" && Number.isFinite(colData.Dual)) {
            setOwnProperty(reducedCostsRecord, v.name, Math.abs(colData.Dual) < 1e-9 ? 0 : colData.Dual);
          }
        }
      }
    }

    if (result.Rows) {
      const rowsList: any[] = Array.isArray(result.Rows) ? result.Rows : Object.values(result.Rows);
      for (const rowData of rowsList) {
        const rowName = rowData.Name;
        const c = rowName ? nameToConstraint.get(rowName) : undefined;
        if (c) {
          if (typeof rowData.Dual === "number" && Number.isFinite(rowData.Dual)) {
            setOwnProperty(dualsRecord, c.name, Math.abs(rowData.Dual) < 1e-9 ? 0 : rowData.Dual);
          }
          if (typeof rowData.Primal === "number" && Number.isFinite(rowData.Primal)) {
            const slack = c.rhs - rowData.Primal;
            setOwnProperty(slacksRecord, c.name, Math.abs(slack) < 1e-9 ? 0 : slack);
          }
        }
      }
    }

    return {
      status,
      terminationStatus,
      hasPrimalSolution: true,
      objectiveValue,
      ...(objectiveBound !== undefined ? { objectiveBound } : {}),
      ...(relGap !== undefined ? { relGap, mipGap: relGap } : {}),
      ...(absGap !== undefined ? { absGap } : {}),
      values: valuesRecord,
      reducedCosts: reducedCostsRecord,
      duals: dualsRecord,
      slacks: slacksRecord,
      runTime,
      raw: result,
    };
  }
}

/**
 * Short alias for HighsSolver
 */
export const HiGHS = HighsSolver;

import { registerSolver, setDefaultSolver } from "../registry.js";
export function registerHighsSolver(): void {
  registerSolver("highs", (opts) => new HighsSolver(opts));
  setDefaultSolver((opts) => new HighsSolver(opts));
}
registerHighsSolver();
