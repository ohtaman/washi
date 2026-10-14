import type { Solver, SolverOptions, SolverResult } from "../types.js";
import type { LpModelData, LpExportResult } from "../../lp-writer.js";
import type { SolverStatus } from "../../types.js";
import { registerSolver } from "../registry.js";
import { getGlpk } from "./loader.js";

/**
 * GLPK Solver adapter (GNU Linear Programming Kit via WebAssembly / JS).
 * Supports standard Linear Programming (LP) and Mixed-Integer Programming (MIP).
 */
export class GLPKSolver implements Solver {
  public static readonly capabilities = {
    supportsMIP: true,
    supportsQP: false,
  };
  public readonly name = "GLPK";
  public readonly version = "5.0.0";
  public readonly capabilities = GLPKSolver.capabilities;
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
    const glpk = await getGlpk();

    // Mapping from Var to sanitized name used in LP export
    const { nameToVar, nameToConstraint } = lpResult;
    const varToName = new Map<any, string>();
    for (const [name, v] of nameToVar.entries()) {
      varToName.set(v, name);
    }
    const constraintToName = new Map<any, string>();
    for (const [name, c] of nameToConstraint.entries()) {
      constraintToName.set(c, name);
    }

    // 1. Objective linear variables
    const objVars: { name: string; coef: number }[] = [];
    const linTerms =
      "linearTerms" in modelData.objective
        ? (modelData.objective as any).linearTerms
        : (modelData.objective as any).terms;
    if (linTerms) {
      for (const [v, coef] of linTerms) {
        if (Math.abs(coef) < 1e-12) continue;
        const vName = varToName.get(v) || v.name;
        objVars.push({ name: vName, coef: Number(coef) });
      }
    }

    // 2. Constraints (subjectTo)
    const subjectTo: any[] = [];
    for (const c of modelData.constraints) {
      const cName = constraintToName.get(c) || c.name || `c_${subjectTo.length + 1}`;
      const vars: { name: string; coef: number }[] = [];

      for (const [v, coef] of c.lhs.terms) {
        if (Math.abs(coef) < 1e-12) continue;
        const vName = varToName.get(v) || v.name;
        vars.push({ name: vName, coef: Number(coef) });
      }

      let bnds: { type: number; lb: number; ub: number };
      if (c.sense === "==") {
        bnds = { type: glpk.GLP_FX, lb: c.rhs, ub: c.rhs };
      } else if (c.sense === "<=") {
        bnds = { type: glpk.GLP_UP, lb: -Infinity, ub: c.rhs };
      } else {
        // >=
        bnds = { type: glpk.GLP_LO, lb: c.rhs, ub: Infinity };
      }

      subjectTo.push({
        name: cName,
        vars,
        bnds,
      });
    }

    // 3. Variable types and bounds
    const binaries: string[] = [];
    const generals: string[] = [];
    const bounds: any[] = [];

    for (const v of modelData.variables) {
      const vName = varToName.get(v) || v.name;

      if (v.type === "Binary") {
        binaries.push(vName);
      } else if (v.type === "Integer") {
        generals.push(vName);
      }

      // Variable bounds
      const lb = v.lb;
      const ub = v.ub;
      let bndType: number;

      if (lb === -Infinity && ub === Infinity) {
        bndType = glpk.GLP_FR;
      } else if (lb !== -Infinity && ub === Infinity) {
        bndType = glpk.GLP_LO;
      } else if (lb === -Infinity && ub !== Infinity) {
        bndType = glpk.GLP_UP;
      } else if (lb === ub) {
        bndType = glpk.GLP_FX;
      } else {
        bndType = glpk.GLP_DB;
      }

      bounds.push({
        name: vName,
        type: bndType,
        lb: lb === -Infinity ? 0 : lb,
        ub: ub === Infinity ? 0 : ub,
      });
    }

    const glpkProblem: any = {
      name: modelData.name || "GLPK_Model",
      objective: {
        direction:
          modelData.sense && modelData.sense.toLowerCase() === "maximize"
            ? glpk.GLP_MAX
            : glpk.GLP_MIN,
        name: "obj",
        vars: objVars,
      },
      subjectTo,
    };

    if (bounds.length > 0) glpkProblem.bounds = bounds;
    if (binaries.length > 0) glpkProblem.binaries = binaries;
    if (generals.length > 0) glpkProblem.generals = generals;

    const glpkOptions: any = {
      msglev: mergedOptions.verbose ? glpk.GLP_MSG_ALL : glpk.GLP_MSG_OFF,
      presol: mergedOptions.presolve !== "off",
    };
    if (typeof mergedOptions.timeLimit === "number") {
      glpkOptions.tmlim = mergedOptions.timeLimit;
    }
    if (typeof mergedOptions.mipGap === "number") {
      glpkOptions.mipgap = mergedOptions.mipGap;
    }

    const startTime = performance.now();
    const rawResult = await glpk.solve(glpkProblem, glpkOptions);
    const runTime = (performance.now() - startTime) / 1000;

    const rawStatus = rawResult?.result?.status;
    const status = mapGlpkStatus(rawStatus, glpk);

    // Only expose objective and variable values when a valid primal solution/incumbent exists
    const hasPrimalSolution = status === "Optimal" || status === "Feasible";

    if (!hasPrimalSolution) {
      return {
        status,
        objectiveValue: null,
        values: {},
        duals: {},
        slacks: {},
        runTime: rawResult?.time || runTime,
        logs: [`GLPK solve finished with status: ${status}.`],
        raw: rawResult,
      };
    }

    const rawObj = rawResult?.result?.z;
    const objectiveValue =
      typeof rawObj === "number" ? rawObj + modelData.objective.constant : null;

    const valuesRecord: Record<string, number> = {};
    const rawVars = rawResult?.result?.vars || {};

    for (const [vName, val] of Object.entries(rawVars)) {
      const v = nameToVar.get(vName);
      const originalName = v ? v.name : vName;
      const numVal = typeof val === "number" ? (Math.abs(val) < 1e-9 ? 0 : val) : 0;
      valuesRecord[originalName] = numVal;
    }

    // When an optimal or feasible primal solution exists, ensure all model variables have an entry
    for (const v of modelData.variables) {
      if (valuesRecord[v.name] === undefined) {
        valuesRecord[v.name] = 0;
      }
    }

    // Dual values: provided for LP (simplex) solves; MIP does not produce dual solutions
    const dualsRecord: Record<string, number> = {};
    if (rawResult?.result?.dual) {
      for (const [cName, dualVal] of Object.entries(rawResult.result.dual)) {
        const c = nameToConstraint.get(cName);
        const originalName = c ? c.name : cName;
        dualsRecord[originalName] = Number(dualVal);
      }
    }

    return {
      status,
      objectiveValue,
      values: valuesRecord,
      duals: dualsRecord,
      runTime: rawResult?.time || runTime,
      logs: [`GLPK solved in ${(rawResult?.time || runTime) * 1000} ms.`],
      raw: rawResult,
    };
  }
}

/**
 * Maps a raw GLPK status code to a WaSHI SolverStatus.
 *
 * GLPK status codes (glpk.js):
 * - GLP_UNDEF (1): Solution is undefined
 * - GLP_FEAS  (2): Solution is feasible (incumbent found, optimality not proven)
 * - GLP_INFEAS(3): Solution is infeasible
 * - GLP_NOFEAS(4): Problem has no feasible solution
 * - GLP_OPT   (5): Solution is optimal
 * - GLP_UNBND (6): Solution is unbounded
 *
 * Unknown, missing, or error codes map to "Unknown" or "Error" and NEVER to "Optimal".
 */
export function mapGlpkStatus(rawStatus: unknown, glpk?: any): SolverStatus {
  if (typeof rawStatus !== "number") {
    return "Unknown";
  }

  const optCode = glpk?.GLP_OPT ?? 5;
  const feasCode = glpk?.GLP_FEAS ?? 2;
  const infeasCode = glpk?.GLP_INFEAS ?? 3;
  const nofeasCode = glpk?.GLP_NOFEAS ?? 4;
  const unbndCode = glpk?.GLP_UNBND ?? 6;
  const undefCode = glpk?.GLP_UNDEF ?? 1;

  if (rawStatus === optCode) {
    return "Optimal";
  }
  if (rawStatus === feasCode) {
    return "Feasible";
  }
  if (rawStatus === infeasCode || rawStatus === nofeasCode) {
    return "Infeasible";
  }
  if (rawStatus === unbndCode) {
    return "Unbounded";
  }
  if (rawStatus === undefCode) {
    return "Unknown";
  }

  return "Unknown";
}

/**
 * Register GLPK solver into the solver registry.
 */
export function registerGLPKSolver(): void {
  registerSolver("glpk", (opts) => new GLPKSolver(opts));
}

// Auto-register so importing '@ohtaman/washi/solvers/glpk' instantly makes 'glpk' available.
registerGLPKSolver();
