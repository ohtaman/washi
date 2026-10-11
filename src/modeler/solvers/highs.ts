import type { Solver, SolverOptions, SolverResult } from "./types.js";
import type { LpModelData, LpExportResult } from "../lp-writer.js";
import type { SolverStatus } from "../types.js";
import { solveLp } from "../../highs-worker-client.js";

/**
 * Map a raw HiGHS model status string to WaSHI's standardized SolverStatus.
 * Only verified optimality maps to "Optimal"; missing or unrecognized statuses map to "Unknown".
 */
export function mapHighsStatus(rawStatus: unknown): SolverStatus {
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
    case "Primal infeasible or unbounded":
      return "Unbounded";
    case "Time limit reached":
    case "TimeLimit":
      return "TimeLimit";
    case "Iteration limit reached":
    case "IterationLimit":
      return "IterationLimit";
    case "Bound on objective reached":
    case "Target for objective reached":
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
  if (lower.includes("error")) {
    return "Error";
  }
  if (lower === "optimal") {
    return "Optimal";
  }

  return "Unknown";
}

/**
 * HiGHS Solver adapter (WebAssembly in Browser / Node.js)
 * High-performance simplex / interior point / branch-and-cut solver.
 */
export class HighsSolver implements Solver {
  public static readonly capabilities = {
    supportsMIP: true,
    supportsQP: true,
  };
  public readonly name = "HiGHS";
  public readonly version = "1.15.3";
  public readonly capabilities = HighsSolver.capabilities;
  public options: SolverOptions;

  constructor(options: SolverOptions = {}) {
    this.options = options;
  }

  async solve(
    modelData: LpModelData,
    lpResult: LpExportResult,
    options: SolverOptions = {}
  ): Promise<SolverResult> {
    const mergedOptions: SolverOptions = { ...this.options, ...options };
    const { lpString, nameToVar, nameToConstraint } = lpResult;

    const { result, runTime } = await solveLp(lpString, mergedOptions);

    const status = mapHighsStatus(result?.Status);

    const rawObj = result.ObjectiveValue;
    const objectiveValue =
      typeof rawObj === "number" ? rawObj + modelData.objective.constant : null;

    const valuesRecord: Record<string, number> = {};
    const dualsRecord: Record<string, number> = {};
    const reducedCostsRecord: Record<string, number> = {};
    const slacksRecord: Record<string, number> = {};

    if (result.Columns) {
      for (const [colName, colData] of Object.entries(result.Columns)) {
        const v = nameToVar.get(colName);
        if (v) {
          const primal = Math.abs(colData.Primal) < 1e-9 ? 0 : colData.Primal;
          valuesRecord[v.name] = primal;
          if (colData.Dual !== undefined) {
            reducedCostsRecord[v.name] = Math.abs(colData.Dual) < 1e-9 ? 0 : colData.Dual;
          }
        }
      }
    }

    if (result.Rows) {
      const rowsList: any[] = Array.isArray(result.Rows) ? result.Rows : Object.values(result.Rows);
      for (const rowData of rowsList) {
        const rowName = rowData.Name;
        const c = nameToConstraint.get(rowName);
        if (c) {
          if (rowData.Dual !== undefined) {
            dualsRecord[c.name] = Math.abs(rowData.Dual) < 1e-9 ? 0 : rowData.Dual;
          }
          if (rowData.Primal !== undefined) {
            const slack = c.rhs - rowData.Primal;
            slacksRecord[c.name] = Math.abs(slack) < 1e-9 ? 0 : slack;
          }
        }
      }
    }

    return {
      status,
      objectiveValue,
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
 * PuLP-style alias: pulp.HiGHS()
 */
export const HiGHS = HighsSolver;
