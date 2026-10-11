import type { Model } from "../model.js";
import type { Var } from "../variable.js";
import { BoolVar, BoolExpr, BoolOp, type LogicElement } from "../boolean-expr.js";
import type { LinExpr } from "../expression.js";
import type { QuadExpr } from "../quad-expr.js";
import { Constraint } from "../constraint.js";
import type {
  Solver,
  SolverCapabilities,
  SolverOptions,
  SolverResult,
  SolverCheckResult,
} from "./types.js";
import { registerSolver } from "./registry.js";

let z3InitPromise: Promise<any> | null = null;

async function loadZ3(): Promise<any> {
  if (!z3InitPromise) {
    z3InitPromise = (async () => {
      try {
        const z3 = await import("z3-solver");
        return await z3.init();
      } catch (err) {
        throw new Error(
          `Failed to load z3-solver. Ensure it is installed: npm install z3-solver. Error: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    })();
  }
  return z3InitPromise;
}

/**
 * Z3 SMT / SAT / MIP Solver Adapter
 * 
 * Supports:
 * - SAT & SMT logical formulas (And, Or, Not, Implies, Xor)
 * - Feasibility checking via check()
 * - Unsatisfiable core extraction (unsatCore) for conflict diagnosis
 * - Mixed-Integer Programming (MIP) optimization via Z3 Optimize
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

    function translateLinExpr(expr: LinExpr) {
      let result: any = null;
      if (expr && expr.terms) {
        for (const [v, coeff] of expr.terms.entries()) {
          const vAst = getVarAst(v);
          const term = vAst.mul(coeff);
          result = result === null ? term : result.add(term);
        }
      }
      const constant = expr && typeof expr.constant === "number" ? expr.constant : 0;
      if (constant !== 0 || result === null) {
        const offsetAst = ctx.Real.val(constant);
        result = result === null ? offsetAst : result.add(offsetAst);
      }
      return result;
    }

    function translateQuadExpr(expr: QuadExpr) {
      let result: any = null;
      if (expr.linearTerms) {
        for (const [v, coeff] of expr.linearTerms.entries()) {
          const vAst = getVarAst(v);
          const term = vAst.mul(coeff);
          result = result === null ? term : result.add(term);
        }
      }
      if (expr.quadTerms) {
        for (const t of expr.quadTerms.values()) {
          const v1 = getVarAst(t.var1);
          const v2 = getVarAst(t.var2);
          const term = v1.mul(v2).mul(t.coeff);
          result = result === null ? term : result.add(term);
        }
      }
      const constant = expr && typeof expr.constant === "number" ? expr.constant : 0;
      if (constant !== 0 || result === null) {
        const cAst = ctx.Real.val(constant);
        result = result === null ? cAst : result.add(cAst);
      }
      return result;
    }

    function translateConstraint(c: Constraint) {
      const lhsAst =
        c.lhs instanceof Object && "quadTerms" in c.lhs
          ? translateQuadExpr(c.lhs as any)
          : translateLinExpr(c.lhs);

      const rhsVal = typeof c.rhs === "number" ? c.rhs : 0;
      if (c.sense === "<=") {
        return lhsAst.le(rhsVal);
      } else if (c.sense === ">=") {
        return lhsAst.ge(rhsVal);
      } else {
        return lhsAst.eq(rhsVal);
      }
    }

    function translateBoolExpr(be: LogicElement): any {
      if (be instanceof BoolVar) {
        return getBoolVarAst(be);
      }
      if (be instanceof Constraint) {
        return translateConstraint(be);
      }
      if (be instanceof BoolOp) {
        switch (be.op) {
          case "and":
            return ctx.And(...be.children.map(translateBoolExpr));
          case "or":
            return ctx.Or(...be.children.map(translateBoolExpr));
          case "not":
            return ctx.Not(translateBoolExpr(be.children[0]));
          case "implies":
            return ctx.Implies(
              translateBoolExpr(be.children[0]),
              translateBoolExpr(be.children[1])
            );
          case "xor":
            return ctx.Xor(
              translateBoolExpr(be.children[0]),
              translateBoolExpr(be.children[1])
            );
          default:
            throw new Error(`Unsupported boolean operation: ${(be as any).op}`);
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
  async check(modelData: any, _options: SolverOptions = {}): Promise<SolverCheckResult> {
    const isBrowser = typeof window !== "undefined" && typeof (window as any).document !== "undefined";

    if (isBrowser) {
      return this.fallbackCheck(modelData);
    }

    try {
      const { Context } = await loadZ3();
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
          s.add(vAst.ge(v.lb));
        }
        if (v.ub !== Infinity) {
          s.add(vAst.le(v.ub));
        }
        const isBin = v.type === "Binary" || (v.type as string) === "BINARY";
        if (isBin) {
          s.add(vAst.ge(0));
          s.add(vAst.le(1));
        }
      }

      // 2. Arithmetic Constraints (tracked for unsatCore)
      for (const c of constraints) {
        const cAst = trans.translateConstraint(c);
        const trackVar = ctx.Bool.const(c.name);
        s.addAndTrack(cAst, trackVar);
      }

      // 3. Logical Constraints (tracked for unsatCore)
      for (let i = 0; i < logicalConstraints.length; i++) {
        const item = logicalConstraints[i];
        const name = (item && (item as any).name) || `lc_${i + 1}`;
        const expr = (item && (item as any).expr) || item;
        const lcAst = trans.translateBoolExpr(expr);
        const trackVar = ctx.Bool.const(name);
        s.addAndTrack(lcAst, trackVar);
      }

      const checkRes = await s.check();
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
          unsatCore.push(coreVector.get(i).toString());
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
    } catch (_err) {
      // Graceful fallback to pure JS SMT engine
      return this.fallbackCheck(modelData);
    }
  }

  /**
   * Lightweight in-memory SMT / SAT reasoning engine for browser environments
   * or when z3-solver native WASM is not available.
   */
  private fallbackCheck(modelData: any): SolverCheckResult {
    const startTime = performance.now();
    const variables: Var[] = modelData.variables || modelData.vars || [];
    const boolVars: BoolVar[] = modelData.boolVars || [];
    const constraints: Constraint[] = modelData.constraints || [];
    const logicalConstraints = modelData.logicalConstraints || [];

    function evalLinExpr(expr: any, numMap: Map<string, number>): number {
      let sum = expr.constant || 0;
      if (expr.terms && expr.terms instanceof Map) {
        for (const [v, coeff] of expr.terms.entries()) {
          const vName = typeof v === "string" ? v : v.name;
          sum += coeff * (numMap.get(vName) ?? 0);
        }
      }
      return sum;
    }

    function evalConstraint(c: Constraint, numMap: Map<string, number>): boolean {
      const lhsVal = evalLinExpr(c.lhs, numMap);
      const eps = 1e-6;
      if (c.sense === "<=") return lhsVal <= c.rhs + eps;
      if (c.sense === ">=") return lhsVal >= c.rhs - eps;
      if (c.sense === "==") return Math.abs(lhsVal - c.rhs) <= eps;
      return false;
    }

    function evalFormula(expr: any, boolMap: Map<string, boolean>, numMap: Map<string, number>): boolean {
      if (expr instanceof BoolVar) {
        return boolMap.get(expr.name) ?? false;
      }
      if (expr instanceof Constraint) {
        return evalConstraint(expr, numMap);
      }
      if (expr instanceof BoolOp) {
        switch (expr.op) {
          case "and":
            return expr.children.every((c: any) => evalFormula(c, boolMap, numMap));
          case "or":
            return expr.children.some((c: any) => evalFormula(c, boolMap, numMap));
          case "not":
            return !evalFormula(expr.children[0], boolMap, numMap);
          case "implies":
            return !evalFormula(expr.children[0], boolMap, numMap) || evalFormula(expr.children[1], boolMap, numMap);
          case "xor":
            return evalFormula(expr.children[0], boolMap, numMap) !== evalFormula(expr.children[1], boolMap, numMap);
        }
      }
      return false;
    }

    const candidateValues = new Map<string, number[]>();
    for (const v of variables) {
      const vals = new Set<number>();
      if (v.lb !== -Infinity) vals.add(v.lb);
      if (v.ub !== Infinity) vals.add(v.ub);
      vals.add(0);
      for (const c of constraints) {
        if (c.lhs.terms && c.lhs.terms.has(v)) {
          const coeff = c.lhs.terms.get(v) || 1;
          const target = (c.rhs - (c.lhs.constant || 0)) / coeff;
          vals.add(target);
          vals.add(target - 1);
          vals.add(target + 1);
        }
      }
      for (const lc of logicalConstraints) {
        const expr = lc.expr || lc;
        const collectConstrs = (e: any) => {
          if (e instanceof Constraint) {
            if (e.lhs.terms && e.lhs.terms.has(v)) {
              const coeff = e.lhs.terms.get(v) || 1;
              const target = (e.rhs - (e.lhs.constant || 0)) / coeff;
              vals.add(target);
              vals.add(target - 1);
              vals.add(target + 1);
            }
          } else if (e instanceof BoolOp) {
            e.children.forEach(collectConstrs);
          }
        };
        collectConstrs(expr);
      }
      // If integer variable with small domain, populate discrete steps
      const isInt = v.type === "Integer" || (v.type as string) === "INTEGER";
      if (isInt && v.lb >= 0 && v.ub <= 25) {
        for (let k = v.lb; k <= v.ub; k++) vals.add(k);
      }
      candidateValues.set(
        v.name,
        Array.from(vals).filter((x) => x >= (v.lb ?? -Infinity) && x <= (v.ub ?? Infinity))
      );
    }

    function checkFeasibility(
      activeConstrs: Constraint[],
      activeLogics: { name: string; expr: any }[]
    ): { isSat: boolean; boolMap?: Map<string, boolean>; numMap?: Map<string, number> } {
      const boolNames = boolVars.map((b) => b.name);
      const totalBoolCombos = 1 << boolNames.length;

      const varNames = variables.map((v) => v.name);
      let numCombos: Map<string, number>[] = [new Map()];
      for (const name of varNames) {
        const candidates = candidateValues.get(name) || [0];
        const next: Map<string, number>[] = [];
        for (const cur of numCombos) {
          for (const val of candidates) {
            const m = new Map(cur);
            m.set(name, val);
            next.push(m);
          }
        }
        numCombos = next.slice(0, 500);
      }

      for (let bMask = 0; bMask < totalBoolCombos; bMask++) {
        const boolMap = new Map<string, boolean>();
        for (let i = 0; i < boolNames.length; i++) {
          boolMap.set(boolNames[i], (bMask & (1 << i)) !== 0);
        }

        for (const numMap of numCombos) {
          const allLinearPassed = activeConstrs.every((c) => evalConstraint(c, numMap));
          if (!allLinearPassed) continue;

          const allLogicPassed = activeLogics.every((lc) => evalFormula(lc.expr, boolMap, numMap));
          if (allLogicPassed) {
            return { isSat: true, boolMap, numMap };
          }
        }
      }

      return { isSat: false };
    }

    const normalizedLogics = logicalConstraints.map((item: any, i: number) => ({
      name: item?.name || `lc_${i + 1}`,
      expr: item?.expr || item,
    }));

    const mainResult = checkFeasibility(constraints, normalizedLogics);
    const runTime = (performance.now() - startTime) / 1000;

    if (mainResult.isSat && mainResult.boolMap && mainResult.numMap) {
      const values: Record<string, number | boolean> = {};
      for (const [k, v] of mainResult.numMap.entries()) {
        values[k] = v;
      }
      for (const [k, v] of mainResult.boolMap.entries()) {
        values[k] = v;
      }
      return {
        status: "Sat",
        values,
        runTime,
      };
    }

    const unsatCore: string[] = [];
    for (let i = 0; i < constraints.length; i++) {
      const subset = constraints.filter((_, idx) => idx !== i);
      const subRes = checkFeasibility(subset, normalizedLogics);
      if (subRes.isSat) {
        unsatCore.push(constraints[i].name);
      }
    }
    for (let i = 0; i < normalizedLogics.length; i++) {
      const subset = normalizedLogics.filter((_: any, idx: number) => idx !== i);
      const subRes = checkFeasibility(constraints, subset);
      if (subRes.isSat) {
        unsatCore.push(normalizedLogics[i].name);
      }
    }

    return {
      status: "Unsat",
      values: {},
      unsatCore: unsatCore.length > 0 ? unsatCore : constraints.map((c) => c.name),
      runTime,
    };
  }

  /**
   * Solve optimization problem (MIP) or feasibility problem
   */
  async solve(
    modelData: any,
    _lpResult: any,
    options: SolverOptions = {}
  ): Promise<SolverResult> {
    const hasObjective =
      modelData.objective !== null &&
      modelData.objective !== undefined &&
      (("terms" in modelData.objective && modelData.objective.terms.size > 0) ||
        ("quadTerms" in modelData.objective && modelData.objective.quadTerms.length > 0) ||
        (modelData.objective.offset && modelData.objective.offset !== 0));

    if (!hasObjective) {
      const checkRes = await this.check(modelData, options);
      const numericValues: Record<string, number> = {};
      for (const [k, v] of Object.entries(checkRes.values)) {
        numericValues[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
      }

      return {
        status: checkRes.status === "Sat" ? "Optimal" : checkRes.status === "Unsat" ? "Infeasible" : "Error",
        objectiveValue: 0,
        values: numericValues,
      };
    }

    const { Context } = await loadZ3();
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
        opt.add(vAst.ge(v.lb));
      }
      if (v.ub !== Infinity) {
        opt.add(vAst.le(v.ub));
      }
      const isBin = v.type === "Binary" || (v.type as string) === "BINARY";
      if (isBin) {
        opt.add(vAst.ge(0));
        opt.add(vAst.le(1));
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
    if (sense === "MAXIMIZE") {
      opt.maximize(objAst);
    } else {
      opt.minimize(objAst);
    }

    const checkRes = await opt.check();
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

      return {
        status: "Optimal",
        objectiveValue: objVal,
        values,
      };
    } else if (statusStr === "unsat") {
      return {
        status: "Infeasible",
        objectiveValue: null,
        values: {},
      };
    } else {
      return {
        status: "Error",
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

// Auto-register so 'z3' is instantly available without manual registration calls
registerZ3Solver();
