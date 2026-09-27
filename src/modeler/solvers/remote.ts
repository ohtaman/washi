import type { Solver, SolverOptions, SolverResult } from "./types.js";
import type { LpModelData, LpExportResult } from "../lp-writer.js";

export interface RemoteSolverOptions extends SolverOptions {
  /** Target HTTP(S) endpoint URL */
  url: string;
  /** Request headers (e.g. Authorization) */
  headers?: Record<string, string>;
  /** Data format: "lp" (default) or "json" */
  format?: "lp" | "json";
  /** Custom request timeout in milliseconds */
  timeout?: number;
}

/**
 * Remote / Cloud Solver adapter.
 * Allows offloading complex LP/MIP problems to a remote server (e.g., Gurobi, CPLEX, COIN-OR CBC, SCIP).
 */
export class RemoteSolver implements Solver {
  public readonly name = "RemoteSolver";
  public options: RemoteSolverOptions;

  constructor(options: RemoteSolverOptions) {
    this.options = options;
  }

  async solve(
    modelData: LpModelData,
    lpResult: LpExportResult,
    options: SolverOptions = {}
  ): Promise<SolverResult> {
    const opts = { ...this.options, ...options };
    if (!opts.url) {
      throw new Error("RemoteSolver requires a valid 'url' option.");
    }

    const t0 = performance.now();
    const payload =
      opts.format === "json"
        ? JSON.stringify({
            name: modelData.name,
            sense: modelData.sense,
            variables: modelData.variables.map((v) => ({
              name: v.name,
              type: v.type,
              lb: v.lb,
              ub: v.ub,
            })),
            objective: {
              terms: Array.from(modelData.objective.terms.entries()).map(([v, c]) => ({
                var: v.name,
                coeff: c,
              })),
              constant: modelData.objective.constant,
            },
            constraints: modelData.constraints.map((c) => ({
              name: c.name,
              sense: c.sense,
              rhs: c.rhs,
              terms: Array.from(c.lhs.terms.entries()).map(([v, coeff]) => ({
                var: v.name,
                coeff,
              })),
            })),
          })
        : JSON.stringify({
            name: modelData.name,
            lp: lpResult.lpString,
            options: opts,
          });

    const response = await fetch(opts.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
      body: payload,
    });

    if (!response.ok) {
      throw new Error(`Remote solver request failed with status: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const runTime = (performance.now() - t0) / 1000;

    return {
      status: data.status || "Optimal",
      objectiveValue: data.objectiveValue ?? data.objective ?? null,
      values: data.values || data.variableValues || {},
      reducedCosts: data.reducedCosts,
      duals: data.duals,
      slacks: data.slacks,
      runTime: data.runTime ?? runTime,
      raw: data,
    };
  }
}
