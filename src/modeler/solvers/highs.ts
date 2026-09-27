import type { Solver, SolverOptions, SolverResult } from "./types.js";
import type { LpModelData, LpExportResult } from "../lp-writer.js";
import type { SolverStatus } from "../types.js";
import { solveLp } from "../../highs-worker-client.js";

/**
 * HiGHS Solver adapter (WebAssembly in Browser / Node.js)
 * High-performance simplex / interior point / branch-and-cut solver.
 */
export class HighsSolver implements Solver {
  public readonly name = "HiGHS";
  public readonly version = "1.15.3";
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

    // Map raw status to standard SolverStatus
    const rawStatus = result.Status || "Unknown";
    let status: SolverStatus;

    if (rawStatus.includes("Optimal")) {
      status = "Optimal";
    } else if (rawStatus.includes("Infeasible")) {
      status = "Infeasible";
    } else if (rawStatus.includes("Unbounded")) {
      status = "Unbounded";
    } else if (rawStatus.includes("TimeLimit") || rawStatus.includes("Time limit")) {
      status = "TimeLimit";
    } else if (rawStatus.includes("IterationLimit")) {
      status = "IterationLimit";
    } else {
      status = "Optimal";
    }

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
