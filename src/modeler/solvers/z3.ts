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
  /**
   * Check feasibility & propositional satisfaction without an objective function.
   * Tracks constraints to return an unsatCore if infeasible.
   */
  async check(modelData: any, _options: SolverOptions = {}): Promise<SolverCheckResult> {
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
