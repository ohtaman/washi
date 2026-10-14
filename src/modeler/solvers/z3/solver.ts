import type { Var } from "../../variable.js";
import { BoolVar, BoolOp, type LogicElement } from "../../boolean-expr.js";
import type { LinExpr } from "../../expression.js";
import type { QuadExpr } from "../../quad-expr.js";
import { Constraint } from "../../constraint.js";
import type {
  Solver,
  SolverCapabilities,
  SolverOptions,
  SolverResult,
  SolverCheckResult,
} from "../types.js";
import { registerSolver } from "../registry.js";
import { loadZ3, resetZ3LoaderCache, killZ3Threads, registerZ3ErrorHandler, unlockAllZ3Semaphores, notifyZ3WorkerError } from "./loader.js";

export { resetZ3LoaderCache, killZ3Threads, unlockAllZ3Semaphores, notifyZ3WorkerError };

/**
 * Z3 SMT / SAT / MIP Solver Adapter
 * 
 * Supports:
 * - SAT & SMT logical formulas (And, Or, Not, Implies, Xor)
 * - Feasibility checking via check()
 * - Unsatisfiable core extraction (unsatCore) for conflict diagnosis
 * - Mixed-Integer Programming (MIP) optimization via Z3 Optimize
 *
 * Solution metrics provided by Z3:
 * - `status` and `terminationStatus`: `"Optimal" | "Infeasible" | "Error"`
 * - `hasPrimalSolution`: `true` when Z3 returns `"sat"` (`status === "Optimal"`), `false` otherwise.
 * - `objectiveValue`: Primal objective value when `hasPrimalSolution` is `true`, otherwise `null`.
 * - `objectiveBound`, `relGap` (`mipGap`), `absGap`: Z3 Optimize is an SMT optimization engine and does not expose branch-and-bound MIP dual bounds or relative/absolute MIP gaps, so these fields are intentionally left `undefined` rather than returning invented defaults.
 */
export class Z3Solver implements Solver {
  readonly name = "z3";
  readonly capabilities: SolverCapabilities = {
    supportsMIP: true,
    supportsQP: false,
    supportsSMT: true,
    supportsUnsatCore: true,
  };

  /**
   * Helper to build AST translations for a given Z3 Context
   */
  private createContextTranslator(ctx: any) {
    const varAstMap = new Map<string, any>();
    const boolVarAstMap = new Map<string, any>();

    function getVarAst(v: Var) {
      if (!varAstMap.has(v.name)) {
        const isCont = v.type === "Continuous" || (v.type as string) === "CONTINUOUS";
        const ast = isCont
          ? ctx.Real.const(v.name)
          : ctx.Int.const(v.name);
        varAstMap.set(v.name, ast);
      }
      return varAstMap.get(v.name);
    }

    function getBoolVarAst(bv: BoolVar) {
      if (!boolVarAstMap.has(bv.name)) {
        const ast = ctx.Bool.const(bv.name);
        boolVarAstMap.set(bv.name, ast);
      }
      return boolVarAstMap.get(bv.name);
    }

    function ensureRealAst(ast: any) {
      return typeof ctx.isInt === "function" && ctx.isInt(ast) ? ctx.ToReal(ast) : ast;
    }

    function addArithAst(a: any, b: any) {
      const aIsInt = typeof ctx.isInt === "function" && ctx.isInt(a);
      const bIsInt = typeof ctx.isInt === "function" && ctx.isInt(b);
      if (aIsInt && bIsInt) {
        return a.add(b);
      }
      return ensureRealAst(a).add(ensureRealAst(b));
    }

    function mulByConst(ast: any, coeff: number) {
      const astIsInt = typeof ctx.isInt === "function" && ctx.isInt(ast);
      if (astIsInt && Number.isInteger(coeff)) {
        return ast.mul(ctx.Int.val(coeff));
      }
      return ensureRealAst(ast).mul(ctx.Real.val(coeff));
    }

    function mulArithAst(a: any, b: any) {
      const aIsInt = typeof ctx.isInt === "function" && ctx.isInt(a);
      const bIsInt = typeof ctx.isInt === "function" && ctx.isInt(b);
      if (aIsInt && bIsInt) {
        return a.mul(b);
      }
      return ensureRealAst(a).mul(ensureRealAst(b));
    }

    function makeConstAst(val: number, preferInt: boolean) {
      if (preferInt && Number.isInteger(val)) {
        return ctx.Int.val(val);
      }
      return ctx.Real.val(val);
    }

    function compareAstWithNumber(lhsAst: any, sense: "<=" | ">=" | "==", rhsVal: number) {
      const lhsIsInt = typeof ctx.isInt === "function" && ctx.isInt(lhsAst);
      const useInt = lhsIsInt && Number.isInteger(rhsVal);
      const lhs = useInt ? lhsAst : ensureRealAst(lhsAst);
      const rhs = useInt ? ctx.Int.val(rhsVal) : ctx.Real.val(rhsVal);
      if (sense === "<=") {
        return lhs.le(rhs);
      } else if (sense === ">=") {
        return lhs.ge(rhs);
      } else {
        return lhs.eq(rhs);
      }
    }

    function translateLinExpr(expr: LinExpr) {
      let result: any = null;
      if (expr && expr.terms) {
        for (const [v, coeff] of expr.terms.entries()) {
          const vAst = getVarAst(v);
          const term = mulByConst(vAst, coeff);
          result = result === null ? term : addArithAst(result, term);
        }
      }
      const constant = expr && typeof expr.constant === "number" ? expr.constant : 0;
      if (constant !== 0 || result === null) {
        const preferInt = result === null || (typeof ctx.isInt === "function" && ctx.isInt(result));
        const offsetAst = makeConstAst(constant, preferInt);
        result = result === null ? offsetAst : addArithAst(result, offsetAst);
      }
      return result;
    }

    function translateQuadExpr(expr: QuadExpr) {
      let result: any = null;
      if (expr.linearTerms) {
        for (const [v, coeff] of expr.linearTerms.entries()) {
          const vAst = getVarAst(v);
          const term = mulByConst(vAst, coeff);
          result = result === null ? term : addArithAst(result, term);
        }
      }
      if (expr.quadTerms) {
        for (const t of expr.quadTerms.values()) {
          const v1 = getVarAst(t.var1);
          const v2 = getVarAst(t.var2);
          const prod = mulArithAst(v1, v2);
          const term = mulByConst(prod, t.coeff);
          result = result === null ? term : addArithAst(result, term);
        }
      }
      const constant = expr && typeof expr.constant === "number" ? expr.constant : 0;
      if (constant !== 0 || result === null) {
        const preferInt = result === null || (typeof ctx.isInt === "function" && ctx.isInt(result));
        const cAst = makeConstAst(constant, preferInt);
        result = result === null ? cAst : addArithAst(result, cAst);
      }
      return result;
    }

    function translateConstraint(c: Constraint) {
      const lhsAst =
        c.lhs instanceof Object && "quadTerms" in c.lhs
          ? translateQuadExpr(c.lhs as any)
          : translateLinExpr(c.lhs);

      const rhsVal = typeof c.rhs === "number" ? c.rhs : 0;
      return compareAstWithNumber(lhsAst, c.sense, rhsVal);
    }

    function translateBoolExpr(be: LogicElement): any {
      if (
        be instanceof BoolVar ||
        (be && typeof be === "object" && "name" in be && typeof (be as any).id === "number" && !("op" in be) && !("lhs" in be))
      ) {
        return getBoolVarAst(be as BoolVar);
      }
      if (
        be instanceof Constraint ||
        (be && typeof be === "object" && "lhs" in be && "sense" in be)
      ) {
        return translateConstraint(be as Constraint);
      }
      if (
        be instanceof BoolOp ||
        (be && typeof be === "object" && "op" in be && Array.isArray((be as any).children))
      ) {
        const opNode = be as BoolOp;
        switch (opNode.op) {
          case "and":
            return ctx.And(...opNode.children.map(translateBoolExpr));
          case "or":
            return ctx.Or(...opNode.children.map(translateBoolExpr));
          case "not":
            return ctx.Not(translateBoolExpr(opNode.children[0]));
          case "implies":
            return ctx.Implies(
              translateBoolExpr(opNode.children[0]),
              translateBoolExpr(opNode.children[1])
            );
          case "xor": {
            if (opNode.children.length === 0) {
              return ctx.Bool.val(false);
            }
            if (opNode.children.length === 1) {
              return translateBoolExpr(opNode.children[0]);
            }
            return opNode.children
              .slice(1)
              .reduce(
                (acc, child) => ctx.Xor(acc, translateBoolExpr(child)),
                translateBoolExpr(opNode.children[0])
              );
          }
          default:
            throw new Error(`Unsupported boolean operation: ${opNode.op}`);
        }
      }
      throw new Error(`Unknown logic element: ${String(be)}`);
    }

    function parseAstValue(val: any): number {
      if (!val) return 0;
      if (typeof val.asNumber === "function") {
        return val.asNumber();
      }
      const s = val.toString();
      if (s.startsWith("(/ ")) {
        // Z3 rational format: (/ num denom)
        const parts = s.slice(3, -1).trim().split(/\s+/);
        if (parts.length === 2) {
          return Number(parts[0]) / Number(parts[1]);
        }
      }
      return Number(s);
    }

    return {
      getVarAst,
      getBoolVarAst,
      compareAstWithNumber,
      translateLinExpr,
      translateQuadExpr,
      translateConstraint,
      translateBoolExpr,
      parseAstValue,
      varAstMap,
      boolVarAstMap,
    };
  }

  /**
   * Check feasibility & propositional satisfaction without an objective function.
   * Tracks constraints to return an unsatCore if infeasible.
   */
  async check(modelData: any, options: SolverOptions = {}): Promise<SolverCheckResult> {
    if (options.signal?.aborted) {
      return {
        status: "Unknown",
        values: {},
      };
    }
    const { Context } = await loadZ3(options);
    if (options.signal?.aborted) {
      return {
        status: "Unknown",
        values: {},
      };
    }
    const ctx = new Context(`check_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    const s = new ctx.Solver();
    const trans = this.createContextTranslator(ctx);

    const variables: Var[] = modelData.variables || modelData.vars || [];
    const boolVars: BoolVar[] = modelData.boolVars || [];
    const constraints: Constraint[] = modelData.constraints || [];
    const logicalConstraints = modelData.logicalConstraints || [];

    // 1. Variable bounds
    for (const v of variables) {
      const vAst = trans.getVarAst(v);
      if (v.lb !== -Infinity) {
        s.add(trans.compareAstWithNumber(vAst, ">=", v.lb));
      }
      if (v.ub !== Infinity) {
        s.add(trans.compareAstWithNumber(vAst, "<=", v.ub));
      }
      const isBin = v.type === "Binary" || (v.type as string) === "BINARY";
      if (isBin) {
        s.add(trans.compareAstWithNumber(vAst, ">=", 0));
        s.add(trans.compareAstWithNumber(vAst, "<=", 1));
      }
    }

    const trackKeyToName = new Map<string, string>();
    let trackCounter = 0;
    const createTracker = (constraintName: string) => {
      const trackKey = `__washi_track_${++trackCounter}`;
      const trackVar = ctx.Bool.const(trackKey);
      trackKeyToName.set(trackKey, constraintName);
      trackKeyToName.set(trackVar.toString(), constraintName);
      return trackVar;
    };

    // 2. Add tracked arithmetic and logical constraints
    for (const c of constraints) {
      s.addAndTrack(trans.translateConstraint(c), createTracker(c.name));
    }
    for (let i = 0; i < logicalConstraints.length; i++) {
      const item = logicalConstraints[i];
      const name = (item && item.name) || `lc_${i + 1}`;
      const expr = (item && item.expr) || item;
      s.addAndTrack(trans.translateBoolExpr(expr), createTracker(name));
    }

    if (options.signal?.aborted) {
      return {
        status: "Unknown",
        values: {},
      };
    }

    let unregister: (() => void) | undefined;
    const onAbort = () => {
      try {
        if (typeof ctx.interrupt === "function") {
          ctx.interrupt();
        }
      } catch {
        // Ignore interrupt errors
      }
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    let checkRes: any;
    try {
      const checkPromise = s.check();
      checkRes = await new Promise((resolve, reject) => {
        unregister = registerZ3ErrorHandler(reject);
        checkPromise.then(resolve, reject);
      });
    } finally {
      options.signal?.removeEventListener("abort", onAbort);
      unregister?.();
    }
    const statusStr = checkRes.toString();

    if (statusStr === "sat") {
      const z3Model = s.model();
      const values: Record<string, number | boolean> = {};

      for (const v of variables) {
        const vAst = trans.getVarAst(v);
        const val = z3Model.eval(vAst);
        values[v.name] = trans.parseAstValue(val);
      }

      for (const bv of boolVars) {
        const bvAst = trans.getBoolVarAst(bv);
        const val = z3Model.eval(bvAst);
        values[bv.name] = val.toString() === "true";
      }

      return {
        status: "Sat",
        values,
      };
    } else if (statusStr === "unsat") {
      const coreVector = s.unsatCore();
      const unsatCore: string[] = [];
      const len = typeof coreVector.length === "function" ? coreVector.length() : coreVector.length;
      for (let i = 0; i < len; i++) {
        const rawKey = coreVector.get(i).toString();
        unsatCore.push(trackKeyToName.get(rawKey) ?? rawKey);
      }

      return {
        status: "Unsat",
        values: {},
        unsatCore,
      };
    } else {
      return {
        status: "Unknown",
        values: {},
      };
    }
  }

  /**
   * Solve optimization problem (MIP) or feasibility problem
   */
  async solve(
    modelData: any,
    _lpResult: any,
    options: SolverOptions = {}
  ): Promise<SolverResult> {
    if (options.signal?.aborted) {
      return {
        status: "Unknown",
        terminationStatus: "Interrupted",
        hasPrimalSolution: false,
        objectiveValue: null,
        values: {},
      };
    }
    const startTime = performance.now();
    const hasObjective =
      modelData.objective !== null &&
      modelData.objective !== undefined &&
      (("terms" in modelData.objective && modelData.objective.terms.size > 0) ||
        ("linearTerms" in modelData.objective && modelData.objective.linearTerms.size > 0) ||
        ("quadTerms" in modelData.objective && modelData.objective.quadTerms.length > 0) ||
        (modelData.objective.offset && modelData.objective.offset !== 0));

    if (!hasObjective) {
      const checkRes = await this.check(modelData, options);
      const numericValues: Record<string, number> = {};
      for (const [k, v] of Object.entries(checkRes.values)) {
        numericValues[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
      }

      const isSat = checkRes.status === "Sat";
      const objVal = isSat ? (modelData.objective?.constant ?? 0) : null;
      if (options.onProgress && !options.signal?.aborted) {
        const elapsed = (performance.now() - startTime) / 1000;
        options.onProgress({
          elapsedTime: elapsed,
          elapsedSeconds: elapsed,
          ...(typeof objVal === "number" && Number.isFinite(objVal) ? { objectiveValue: objVal } : {}),
        });
      }
      if (options.signal?.aborted) {
        return {
          status: isSat ? "Feasible" : "Unknown",
          terminationStatus: "Interrupted",
          hasPrimalSolution: isSat,
          objectiveValue: objVal,
          values: isSat ? numericValues : {},
        };
      }
      const mappedStatus = isSat
        ? "Optimal"
        : checkRes.status === "Unsat"
          ? "Infeasible"
          : checkRes.status === "Unknown"
            ? "Unknown"
            : "Error";
      return {
        status: mappedStatus,
        terminationStatus: mappedStatus,
        hasPrimalSolution: isSat,
        objectiveValue: objVal,
        values: isSat ? numericValues : {},
      };
    }

    const { Context } = await loadZ3(options);
    if (options.signal?.aborted) {
      return {
        status: "Unknown",
        terminationStatus: "Interrupted",
        hasPrimalSolution: false,
        objectiveValue: null,
        values: {},
      };
    }
    const ctx = new Context(`opt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    const opt = new ctx.Optimize();
    const trans = this.createContextTranslator(ctx);

    const variables: Var[] = modelData.variables || modelData.vars || [];
    const boolVars: BoolVar[] = modelData.boolVars || [];
    const constraints: Constraint[] = modelData.constraints || [];
    const logicalConstraints = modelData.logicalConstraints || [];

    // 1. Variable bounds
    for (const v of variables) {
      const vAst = trans.getVarAst(v);
      if (v.lb !== -Infinity) {
        opt.add(trans.compareAstWithNumber(vAst, ">=", v.lb));
      }
      if (v.ub !== Infinity) {
        opt.add(trans.compareAstWithNumber(vAst, "<=", v.ub));
      }
      const isBin = v.type === "Binary" || (v.type as string) === "BINARY";
      if (isBin) {
        opt.add(trans.compareAstWithNumber(vAst, ">=", 0));
        opt.add(trans.compareAstWithNumber(vAst, "<=", 1));
      }
    }

    // 2. Arithmetic constraints
    for (const c of constraints) {
      const cAst = trans.translateConstraint(c);
      opt.add(cAst);
    }

    // 3. Logical constraints
    for (const item of logicalConstraints) {
      const expr = (item && (item as any).expr) || item;
      const lcAst = trans.translateBoolExpr(expr);
      opt.add(lcAst);
    }

    // 4. Objective
    const objAst =
      modelData.objective instanceof Object && "quadTerms" in modelData.objective
        ? trans.translateQuadExpr(modelData.objective as QuadExpr)
        : trans.translateLinExpr(modelData.objective as LinExpr);

    const sense = (modelData.sense || "MINIMIZE").toUpperCase();
    const objHandle = sense === "MAXIMIZE" ? opt.maximize(objAst) : opt.minimize(objAst);

    if (options.signal?.aborted) {
      return {
        status: "Unknown",
        terminationStatus: "Interrupted",
        hasPrimalSolution: false,
        objectiveValue: null,
        values: {},
      };
    }

    let unregister: (() => void) | undefined;
    const onAbort = () => {
      try {
        if (typeof ctx.interrupt === "function") {
          ctx.interrupt();
        }
      } catch {
        // Ignore interrupt errors
      }
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    let checkRes: any;
    try {
      const checkPromise = opt.check();
      checkRes = await new Promise((resolve, reject) => {
        unregister = registerZ3ErrorHandler(reject);
        checkPromise.then(resolve, reject);
      });
    } finally {
      options.signal?.removeEventListener("abort", onAbort);
      unregister?.();
    }
    const statusStr = checkRes.toString();

    if (statusStr === "sat") {
      const z3Model = opt.model();
      const values: Record<string, number> = {};

      for (const v of variables) {
        const vAst = trans.getVarAst(v);
        const val = z3Model.eval(vAst);
        values[v.name] = trans.parseAstValue(val);
      }

      for (const bv of boolVars) {
        const bvAst = trans.getBoolVarAst(bv);
        const val = z3Model.eval(bvAst);
        values[bv.name] = val.toString() === "true" ? 1 : 0;
      }

      const objVal = trans.parseAstValue(z3Model.eval(objAst));
      let isUnbounded = false;
      try {
        const boundAst =
          sense === "MAXIMIZE"
            ? typeof opt.getUpper === "function"
              ? opt.getUpper(objHandle)
              : undefined
            : typeof opt.getLower === "function"
              ? opt.getLower(objHandle)
              : undefined;
        const boundStr = boundAst ? boundAst.toString() : "";
        if (boundStr.includes("oo")) {
          isUnbounded = true;
        }
      } catch {
        // Ignore if bound inspection is unavailable
      }

      const wasAbortedBeforeFinalProgress = Boolean(options.signal?.aborted);
      if (options.onProgress && !wasAbortedBeforeFinalProgress) {
        const elapsed = (performance.now() - startTime) / 1000;
        options.onProgress({
          elapsedTime: elapsed,
          elapsedSeconds: elapsed,
          ...(Number.isFinite(objVal) ? { objectiveValue: objVal } : {}),
        });
      }

      if (wasAbortedBeforeFinalProgress) {
        return {
          status: "Feasible",
          terminationStatus: "Interrupted",
          hasPrimalSolution: true,
          objectiveValue: objVal,
          values,
        };
      }

      if (isUnbounded) {
        return {
          status: "Unbounded",
          terminationStatus: "Unbounded",
          hasPrimalSolution: true,
          objectiveValue: objVal,
          values,
        };
      }

      return {
        status: "Optimal",
        terminationStatus: "Optimal",
        hasPrimalSolution: true,
        objectiveValue: objVal,
        values,
      };
    } else if (statusStr === "unsat") {
      const wasAbortedBeforeFinalProgress = Boolean(options.signal?.aborted);
      if (options.onProgress && !wasAbortedBeforeFinalProgress) {
        const elapsed = (performance.now() - startTime) / 1000;
        options.onProgress({
          elapsedTime: elapsed,
          elapsedSeconds: elapsed,
        });
      }
      if (wasAbortedBeforeFinalProgress) {
        return {
          status: "Unknown",
          terminationStatus: "Interrupted",
          hasPrimalSolution: false,
          objectiveValue: null,
          values: {},
        };
      }
      return {
        status: "Infeasible",
        terminationStatus: "Infeasible",
        hasPrimalSolution: false,
        objectiveValue: null,
        values: {},
      };
    } else if (statusStr === "unknown") {
      if (options.onProgress && !options.signal?.aborted) {
        const elapsed = (performance.now() - startTime) / 1000;
        options.onProgress({
          elapsedTime: elapsed,
          elapsedSeconds: elapsed,
        });
      }
      return {
        status: "Unknown",
        terminationStatus: options.signal?.aborted ? "Interrupted" : "Unknown",
        hasPrimalSolution: false,
        objectiveValue: null,
        values: {},
      };
    } else {
      return {
        status: "Error",
        terminationStatus: "Error",
        hasPrimalSolution: false,
        objectiveValue: null,
        values: {},
      };
    }
  }
}

/**
 * Register Z3 solver into global solver registry
 */
export function registerZ3Solver(): void {
  registerSolver("z3", () => new Z3Solver());
}

// Auto-register so 'z3' is instantly available when importing this module
registerZ3Solver();
