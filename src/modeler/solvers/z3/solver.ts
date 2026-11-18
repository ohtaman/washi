import type { Var } from "../../variable.js";
import { BoolVar, BoolOp, GlobalConstraint, type LogicElement } from "../../boolean-expr.js";
import type { LinExpr, NonlinearAtom } from "../../expression.js";
import type { QuadExpr } from "../../quad-expr.js";
import type { ComparisonSense } from "../../types.js";
import { Constraint } from "../../constraint.js";
import type {
  CheckModelData,
  SolveModelData,
  Solver,
  SolverCapabilities,
  SolverOptions,
  SolverResult,
  SolverCheckResult,
} from "../types.js";
import {
  isLpExportResult,
  type LpExportResult,
  type LpModelData,
} from "../../lp-writer.js";
import { registerSolver } from "../registry.js";
import { loadZ3, resetZ3LoaderCache, killZ3Threads, registerZ3ErrorHandler, notifyZ3WorkerError } from "./loader.js";

export { resetZ3LoaderCache, killZ3Threads, notifyZ3WorkerError };

function setOwnProperty<T>(record: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

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
    supportsLogicalConstraints: true,
    supportsUnsatCore: true,
    supportsWarmStart: false,
  };

  /**
   * Helper to build AST translations for a given Z3 Context
   */
  private createContextTranslator(ctx: any) {
    const varAstMap = new Map<Var, any>();
    const boolVarAstMap = new Map<BoolVar, any>();
    const usedSymbolNames = new Set<string>();

    function allocSymbolName(baseName: string, fallbackPrefix: string): string {
      const base = baseName || fallbackPrefix;
      let candidate = base;
      let suffix = 1;
      while (usedSymbolNames.has(candidate)) {
        candidate = `${base}__${suffix++}`;
      }
      usedSymbolNames.add(candidate);
      return candidate;
    }

    function getVarAst(v: Var) {
      let ast = varAstMap.get(v);
      if (!ast) {
        const symName = allocSymbolName(v.name, `v_${v.id ?? varAstMap.size}`);
        const isCont = v.type === "Continuous" || (v.type as string) === "CONTINUOUS";
        ast = isCont ? ctx.Real.const(symName) : ctx.Int.const(symName);
        varAstMap.set(v, ast);
      }
      return ast;
    }

    function getBoolVarAst(bv: BoolVar) {
      let ast = boolVarAstMap.get(bv);
      if (!ast) {
        const symName = allocSymbolName(bv.name, `b_${bv.id ?? boolVarAstMap.size}`);
        ast = ctx.Bool.const(symName);
        boolVarAstMap.set(bv, ast);
      }
      return ast;
    }

    function isIntAst(ast: any): boolean {
      return typeof ctx.isInt === "function" && ctx.isInt(ast);
    }

    function ensureRealAst(ast: any) {
      return isIntAst(ast) ? ctx.ToReal(ast) : ast;
    }

    function alignArithSorts(a: any, b: any): [any, any] {
      const aIsInt = isIntAst(a);
      const bIsInt = isIntAst(b);
      if (aIsInt === bIsInt) return [a, b];
      return [ensureRealAst(a), ensureRealAst(b)];
    }

    function iteArithAst(condAst: any, thenAst: any, elseAst: any) {
      const [t, e] = alignArithSorts(thenAst, elseAst);
      return ctx.If(condAst, t, e);
    }

    function compareArithAsts(a: any, sense: ComparisonSense, b: any) {
      const [lhs, rhs] = alignArithSorts(a, b);
      if (sense === "<=") return lhs.le(rhs);
      if (sense === ">=") return lhs.ge(rhs);
      if (sense === "!=") return lhs.neq(rhs);
      return lhs.eq(rhs);
    }

    function addArithAst(a: any, b: any) {
      const aIsInt = isIntAst(a);
      const bIsInt = isIntAst(b);
      if (aIsInt && bIsInt) {
        return a.add(b);
      }
      return ensureRealAst(a).add(ensureRealAst(b));
    }

    function mulByConst(ast: any, coeff: number) {
      const astIsInt = isIntAst(ast);
      if (astIsInt && Number.isInteger(coeff)) {
        return ast.mul(ctx.Int.val(coeff));
      }
      return ensureRealAst(ast).mul(ctx.Real.val(coeff));
    }

    function mulArithAst(a: any, b: any) {
      const aIsInt = isIntAst(a);
      const bIsInt = isIntAst(b);
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

    function compareAstWithNumber(lhsAst: any, sense: ComparisonSense, rhsVal: number) {
      const lhsIsInt = isIntAst(lhsAst);
      const useInt = lhsIsInt && Number.isInteger(rhsVal);
      const lhs = useInt ? lhsAst : ensureRealAst(lhsAst);
      const rhs = useInt ? ctx.Int.val(rhsVal) : ctx.Real.val(rhsVal);
      if (sense === "<=") {
        return lhs.le(rhs);
      } else if (sense === ">=") {
        return lhs.ge(rhs);
      } else if (sense === "!=") {
        return lhs.neq(rhs);
      } else {
        return lhs.eq(rhs);
      }
    }

    function translateNonlinearAtom(atom: NonlinearAtom, domainGuards: any[]): any {
      switch (atom.kind) {
        case "abs": {
          const argAst = translateLinExpr(atom.arg, domainGuards);
          const zero = makeConstAst(0, isIntAst(argAst));
          return iteArithAst(argAst.ge(zero), argAst, mulByConst(argAst, -1));
        }
        case "max": {
          let acc = translateLinExpr(atom.args[0], domainGuards);
          for (let i = 1; i < atom.args.length; i++) {
            const nxt = translateLinExpr(atom.args[i], domainGuards);
            const [a, b] = alignArithSorts(acc, nxt);
            acc = ctx.If(a.ge(b), a, b);
          }
          return acc;
        }
        case "min": {
          let acc = translateLinExpr(atom.args[0], domainGuards);
          for (let i = 1; i < atom.args.length; i++) {
            const nxt = translateLinExpr(atom.args[i], domainGuards);
            const [a, b] = alignArithSorts(acc, nxt);
            acc = ctx.If(a.le(b), a, b);
          }
          return acc;
        }
        case "at": {
          const idxAst = translateLinExpr(atom.index, domainGuards);
          const elemAsts = atom.array.map((el) => translateLinExpr(el, domainGuards));
          domainGuards.push(
            ctx.And(
              compareAstWithNumber(idxAst, ">=", 0),
              compareAstWithNumber(idxAst, "<=", elemAsts.length - 1)
            )
          );
          let acc = elemAsts[elemAsts.length - 1];
          for (let k = elemAsts.length - 2; k >= 0; k--) {
            acc = iteArithAst(compareAstWithNumber(idxAst, "==", k), elemAsts[k], acc);
          }
          return acc;
        }
      }
    }

    function translateLinExpr(expr: LinExpr, domainGuards: any[] = []) {
      let result: any = null;
      if (expr && expr.terms) {
        for (const [v, coeff] of expr.terms.entries()) {
          const vAst = getVarAst(v);
          const term = mulByConst(vAst, coeff);
          result = result === null ? term : addArithAst(result, term);
        }
      }
      if (expr && Array.isArray(expr.nonlinearTerms)) {
        for (const nl of expr.nonlinearTerms) {
          if (nl.coeff === 0) continue;
          const atomAst = translateNonlinearAtom(nl.atom, domainGuards);
          const term = nl.coeff === 1 ? atomAst : mulByConst(atomAst, nl.coeff);
          result = result === null ? term : addArithAst(result, term);
        }
      }
      const constant = expr && typeof expr.constant === "number" ? expr.constant : 0;
      if (constant !== 0 || result === null) {
        const preferInt = result === null || isIntAst(result);
        const offsetAst = makeConstAst(constant, preferInt);
        result = result === null ? offsetAst : addArithAst(result, offsetAst);
      }
      return result;
    }

    function translateQuadExpr(expr: QuadExpr, domainGuards: any[] = []) {
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
      if (Array.isArray(expr.nonlinearTerms)) {
        for (const nl of expr.nonlinearTerms) {
          if (nl.coeff === 0) continue;
          const atomAst = translateNonlinearAtom(nl.atom, domainGuards);
          const term = nl.coeff === 1 ? atomAst : mulByConst(atomAst, nl.coeff);
          result = result === null ? term : addArithAst(result, term);
        }
      }
      const constant = expr && typeof expr.constant === "number" ? expr.constant : 0;
      if (constant !== 0 || result === null) {
        const preferInt = result === null || isIntAst(result);
        const cAst = makeConstAst(constant, preferInt);
        result = result === null ? cAst : addArithAst(result, cAst);
      }
      return result;
    }

    function translateConstraint(c: Constraint, domainGuards?: any[]) {
      if (c._indicatorMeta) {
        const meta = c._indicatorMeta;
        const binAst = getVarAst(meta.binVar);
        const condAst = compareAstWithNumber(binAst, "==", meta.activeValue);
        const localGuards: any[] = [];
        const targetGuards = domainGuards ?? localGuards;
        const targetAst = compareAstWithNumber(
          translateLinExpr(meta.targetLhs, targetGuards),
          meta.targetSense,
          meta.targetRhs
        );
        const consequent =
          !domainGuards && localGuards.length > 0
            ? ctx.And(targetAst, ...localGuards)
            : targetAst;
        return ctx.Implies(condAst, consequent);
      }

      const localGuards: any[] = [];
      const guardsTarget = domainGuards ?? localGuards;
      const lhsAst =
        c.lhs instanceof Object && "quadTerms" in c.lhs
          ? translateQuadExpr(c.lhs as any, guardsTarget)
          : translateLinExpr(c.lhs, guardsTarget);

      const rhsVal = typeof c.rhs === "number" ? c.rhs : 0;
      const cmpAst = compareAstWithNumber(lhsAst, c.sense, rhsVal);
      if (!domainGuards && localGuards.length > 0) {
        return ctx.And(cmpAst, ...localGuards);
      }
      return cmpAst;
    }

    function translateBoolExpr(be: LogicElement, domainGuards: any[] = []): any {
      if (
        be instanceof BoolVar ||
        (be && typeof be === "object" && "name" in be && typeof (be as any).id === "number" && !("op" in be) && !("lhs" in be) && !("spec" in be))
      ) {
        return getBoolVarAst(be as BoolVar);
      }
      if (
        be instanceof Constraint ||
        (be && typeof be === "object" && "lhs" in be && "sense" in be)
      ) {
        return translateConstraint(be as Constraint, domainGuards);
      }
      if (
        be instanceof GlobalConstraint ||
        (be && typeof be === "object" && "spec" in be && typeof (be as any).spec === "object")
      ) {
        const spec = (be as GlobalConstraint).spec;
        switch (spec.kind) {
          case "distinct": {
            const asts = spec.args.map((a) => translateLinExpr(a, domainGuards));
            if (asts.length <= 1) return ctx.Bool.val(true);
            const hasReal = asts.some((a) => !isIntAst(a));
            const normalized = hasReal ? asts.map(ensureRealAst) : asts;
            return ctx.Distinct(...normalized);
          }
          case "disjoint": {
            const starts = spec.tasks.map((t) => translateLinExpr(t.start, domainGuards));
            const pairs: any[] = [];
            for (let i = 0; i < spec.tasks.length; i++) {
              for (let j = i + 1; j < spec.tasks.length; j++) {
                const dI = spec.tasks[i].duration;
                const dJ = spec.tasks[j].duration;
                if (dI === 0 && dJ === 0) continue;
                const endI = addArithAst(starts[i], makeConstAst(dI, isIntAst(starts[i])));
                const endJ = addArithAst(starts[j], makeConstAst(dJ, isIntAst(starts[j])));
                pairs.push(
                  ctx.Or(
                    compareArithAsts(endI, "<=", starts[j]),
                    compareArithAsts(endJ, "<=", starts[i])
                  )
                );
              }
            }
            return pairs.length === 0 ? ctx.Bool.val(true) : ctx.And(...pairs);
          }
          case "cumulative": {
            const translatedTasks = spec.tasks.map((t) => ({
              duration: t.duration,
              demand: t.demand,
              startAst: translateLinExpr(t.start, domainGuards),
            }));
            const active = translatedTasks.filter((t) => t.duration > 0 && t.demand > 0);
            if (active.length === 0) return ctx.Bool.val(true);
            if (active.some((t) => t.demand > spec.capacity)) return ctx.Bool.val(false);
            const starts = active.map((t) => t.startAst);
            const perEvent: any[] = [];
            for (let k = 0; k < active.length; k++) {
              let load: any = makeConstAst(active[k].demand, true);
              for (let i = 0; i < active.length; i++) {
                if (i === k) continue;
                const cond = ctx.And(
                  compareArithAsts(starts[i], "<=", starts[k]),
                  compareArithAsts(
                    starts[k],
                    "<=",
                    addArithAst(starts[i], makeConstAst(active[i].duration - 1, isIntAst(starts[i])))
                  )
                );
                const contrib = ctx.If(cond, ctx.Int.val(active[i].demand), ctx.Int.val(0));
                load = addArithAst(load, contrib);
              }
              perEvent.push(compareAstWithNumber(load, "<=", spec.capacity));
            }
            return ctx.And(...perEvent);
          }
          case "allowed": {
            const varAsts = spec.vars.map((v) => translateLinExpr(v, domainGuards));
            if (spec.tuples.length === 0) return ctx.Bool.val(false);
            const disj = spec.tuples.map((row) =>
              ctx.And(...row.map((val, j) => compareAstWithNumber(varAsts[j], "==", val)))
            );
            return disj.length === 1 ? disj[0] : ctx.Or(...disj);
          }
        }
      }
      if (
        be instanceof BoolOp ||
        (be && typeof be === "object" && "op" in be && Array.isArray((be as any).children))
      ) {
        const opNode = be as BoolOp;
        switch (opNode.op) {
          case "and":
            return ctx.And(...opNode.children.map((ch) => translateBoolExpr(ch, domainGuards)));
          case "or":
            return ctx.Or(...opNode.children.map((ch) => translateBoolExpr(ch, domainGuards)));
          case "not":
            return ctx.Not(translateBoolExpr(opNode.children[0], domainGuards));
          case "implies":
            return ctx.Implies(
              translateBoolExpr(opNode.children[0], domainGuards),
              translateBoolExpr(opNode.children[1], domainGuards)
            );
          case "xor": {
            if (opNode.children.length === 0) {
              return ctx.Bool.val(false);
            }
            if (opNode.children.length === 1) {
              return translateBoolExpr(opNode.children[0], domainGuards);
            }
            return opNode.children
              .slice(1)
              .reduce(
                (acc, child) => ctx.Xor(acc, translateBoolExpr(child, domainGuards)),
                translateBoolExpr(opNode.children[0], domainGuards)
              );
          }
          default:
            throw new Error(`Unsupported boolean operation: ${opNode.op}`);
        }
      }
      throw new Error(`Unknown logic element: ${String(be)}`);
    }

    function parseSmtNumberString(s: string): number {
      const trimmed = s.trim();
      if (trimmed.startsWith("(- ") && trimmed.endsWith(")")) {
        return -parseSmtNumberString(trimmed.slice(3, -1));
      }
      if (trimmed.startsWith("(/ ") && trimmed.endsWith(")")) {
        const inner = trimmed.slice(3, -1).trim();
        let depth = 0;
        let splitIdx = -1;
        for (let i = 0; i < inner.length; i++) {
          const ch = inner[i];
          if (ch === "(") depth++;
          else if (ch === ")") depth--;
          else if (depth === 0 && /\s/.test(ch)) {
            splitIdx = i;
            break;
          }
        }
        if (splitIdx !== -1) {
          const num = parseSmtNumberString(inner.slice(0, splitIdx));
          const den = parseSmtNumberString(inner.slice(splitIdx + 1));
          const q = num / den;
          return q === 0 ? 0 : q;
        }
      }
      const n = Number(trimmed);
      return n === 0 ? 0 : n;
    }

    function parseAstValue(val: any): number {
      if (!val) return 0;
      if (typeof val.asNumber === "function") {
        const n = val.asNumber();
        if (typeof n === "number" && Number.isFinite(n)) {
          return n === 0 ? 0 : n;
        }
      }
      return parseSmtNumberString(val.toString());
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

  private addVariableBounds(
    target: { add(ast: any): void },
    variables: ReadonlyArray<Var>,
    trans: ReturnType<Z3Solver["createContextTranslator"]>
  ): void {
    for (const v of variables) {
      const vAst = trans.getVarAst(v);
      if (v.lb !== -Infinity) {
        target.add(trans.compareAstWithNumber(vAst, ">=", v.lb));
      }
      if (v.ub !== Infinity) {
        target.add(trans.compareAstWithNumber(vAst, "<=", v.ub));
      }
      const isBin = v.type === "Binary" || (v.type as string) === "BINARY";
      if (isBin) {
        target.add(trans.compareAstWithNumber(vAst, ">=", 0));
        target.add(trans.compareAstWithNumber(vAst, "<=", 1));
      }
    }
  }

  private async runZ3CheckWithErrorGuard(
    target: { check(): Promise<any> },
    instance: any
  ): Promise<any> {
    let unregister: (() => void) | undefined;
    try {
      const checkPromise = target.check();
      return await new Promise((resolve, reject) => {
        unregister = registerZ3ErrorHandler(reject, instance);
        checkPromise.then(resolve, reject);
      });
    } finally {
      unregister?.();
    }
  }

  /**
   * Check feasibility & propositional satisfaction without an objective function.
   * Tracks constraints to return an unsatCore if infeasible.
   */
  async check(modelData: CheckModelData, options: SolverOptions = {}): Promise<SolverCheckResult> {
    if (modelData?.variables?.some((v: Var) => v.initialValue !== undefined)) {
      throw new Error(
        `Solver "${this.name}" does not support primal initial values (initialValue). Please use a solver with warm-start support such as HiGHS or Pumpkin.`
      );
    }
    if (options.signal?.aborted) {
      return {
        status: "Unknown",
        values: {},
      };
    }
    const instance = await loadZ3(options);
    const { Context } = instance;
    if (options.signal?.aborted) {
      return {
        status: "Unknown",
        values: {},
        runTime: 0,
      };
    }
    const startTime = performance.now();
    const ctx = new Context(`check_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    const s = new ctx.Solver();
    const trans = this.createContextTranslator(ctx);

    const variables: ReadonlyArray<Var> = modelData.variables || [];
    const boolVars: ReadonlyArray<BoolVar> = modelData.boolVars || [];
    const constraints: ReadonlyArray<Constraint> = modelData.constraints || [];
    const logicalConstraints = modelData.logicalConstraints || [];

    // 1. Variable bounds
    this.addVariableBounds(s, variables, trans);

    const boolVarNames = new Set(boolVars.map((bv) => bv.name));
    const trackKeyToName = new Map<string, string>();
    let trackCounter = 0;
    const createTracker = (constraintName: string) => {
      let trackKey = `__washi_track_${++trackCounter}`;
      while (boolVarNames.has(trackKey) || trackKeyToName.has(trackKey)) {
        trackKey = `__washi_track_${++trackCounter}`;
      }
      const trackVar = ctx.Bool.const(trackKey);
      trackKeyToName.set(trackKey, constraintName);
      trackKeyToName.set(trackVar.toString(), constraintName);
      return trackVar;
    };

    // 2. Add tracked arithmetic and logical constraints
    for (const c of constraints) {
      const guards: any[] = [];
      const cAst = trans.translateConstraint(c, guards);
      const tracked = guards.length > 0 ? ctx.And(cAst, ...guards) : cAst;
      s.addAndTrack(tracked, createTracker(c.name));
    }
    for (let i = 0; i < logicalConstraints.length; i++) {
      const item = logicalConstraints[i]!;
      const name = "name" in item && typeof item.name === "string" ? item.name : `lc_${i + 1}`;
      const expr = "expr" in item ? item.expr : (item as LogicElement);
      const guards: any[] = [];
      const lcAst = trans.translateBoolExpr(expr, guards);
      const tracked = guards.length > 0 ? ctx.And(lcAst, ...guards) : lcAst;
      s.addAndTrack(tracked, createTracker(name));
    }

    if (options.signal?.aborted) {
      return {
        status: "Unknown",
        values: {},
        runTime: (performance.now() - startTime) / 1000,
      };
    }

    const checkRes = await this.runZ3CheckWithErrorGuard(s, instance);
    const statusStr = checkRes.toString();

    if (statusStr === "sat") {
      const z3Model = s.model();
      const values: Record<string, number | boolean> = {};

      for (const v of variables) {
        const vAst = trans.getVarAst(v);
        const val = z3Model.eval(vAst);
        setOwnProperty(values, v.name, trans.parseAstValue(val));
      }

      for (const bv of boolVars) {
        const bvAst = trans.getBoolVarAst(bv);
        const val = z3Model.eval(bvAst);
        setOwnProperty(values, bv.name, val.toString() === "true");
      }

      return {
        status: "Sat",
        values,
        runTime: (performance.now() - startTime) / 1000,
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
        runTime: (performance.now() - startTime) / 1000,
      };
    } else {
      return {
        status: "Unknown",
        values: {},
        runTime: (performance.now() - startTime) / 1000,
      };
    }
  }

  /**
   * Solve optimization problem (MIP) or feasibility problem
   */
  async solve(modelData: SolveModelData, options?: SolverOptions): Promise<SolverResult>;
  async solve(
    modelData: LpModelData,
    lpResult: LpExportResult,
    options?: SolverOptions
  ): Promise<SolverResult>;
  async solve(
    modelData: SolveModelData,
    lpResultOrOptions?: LpExportResult | SolverOptions,
    maybeOptions?: SolverOptions
  ): Promise<SolverResult> {
    const hasExplicitLpResult = isLpExportResult(lpResultOrOptions);
    const options: SolverOptions = (hasExplicitLpResult ? maybeOptions : lpResultOrOptions) ?? {};

    if (modelData?.variables?.some((v: Var) => v.initialValue !== undefined)) {
      throw new Error(
        `Solver "${this.name}" does not support primal initial values (initialValue). Please use a solver with warm-start support such as HiGHS or Pumpkin.`
      );
    }
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
    const obj = modelData.objective;
    const objHasNonlinear =
      obj !== null &&
      obj !== undefined &&
      Array.isArray((obj as { nonlinearTerms?: unknown[] }).nonlinearTerms) &&
      (obj as { nonlinearTerms: unknown[] }).nonlinearTerms.length > 0;
    const hasObjective =
      obj !== null &&
      obj !== undefined &&
      (objHasNonlinear ||
        ("quadTerms" in obj
          ? obj.linearTerms.size > 0 || obj.quadTerms.size > 0
          : "terms" in obj && obj.terms.size > 0));

    if (!hasObjective) {
      const checkRes = await this.check(modelData, options);
      const numericValues: Record<string, number> = {};
      const boolValues: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(checkRes.values)) {
        if (typeof v === "boolean") {
          setOwnProperty(numericValues, k, v ? 1 : 0);
          setOwnProperty(boolValues, k, v);
        } else {
          setOwnProperty(numericValues, k, v);
        }
      }

      const isSat = checkRes.status === "Sat";
      const objVal = isSat ? (obj?.constant ?? 0) : null;
      const runTime = checkRes.runTime ?? (performance.now() - startTime) / 1000;
      if (options.onProgress && !options.signal?.aborted) {
        options.onProgress({
          elapsedTime: runTime,
          elapsedSeconds: runTime,
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
          runTime,
          ...(isSat && Object.keys(boolValues).length > 0 ? { boolValues } : {}),
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
        runTime,
        ...(isSat && Object.keys(boolValues).length > 0 ? { boolValues } : {}),
      };
    }

    const instance = await loadZ3(options);
    const { Context } = instance;
    if (options.signal?.aborted) {
      return {
        status: "Unknown",
        terminationStatus: "Interrupted",
        hasPrimalSolution: false,
        objectiveValue: null,
        values: {},
        runTime: 0,
      };
    }
    const solveStartTime = performance.now();
    const ctx = new Context(`opt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    const opt = new ctx.Optimize();
    const trans = this.createContextTranslator(ctx);

    const variables: ReadonlyArray<Var> = modelData.variables || [];
    const boolVars: ReadonlyArray<BoolVar> = modelData.boolVars || [];
    const constraints: ReadonlyArray<Constraint> = modelData.constraints || [];
    const logicalConstraints = modelData.logicalConstraints || [];

    // 1. Variable bounds
    this.addVariableBounds(opt, variables, trans);

    const solveGuards: any[] = [];

    // 2. Arithmetic constraints
    for (const c of constraints) {
      const cAst = trans.translateConstraint(c, solveGuards);
      opt.add(cAst);
    }

    // 3. Logical constraints
    for (const item of logicalConstraints) {
      const expr = "expr" in item ? item.expr : (item as LogicElement);
      const lcAst = trans.translateBoolExpr(expr, solveGuards);
      opt.add(lcAst);
    }

    // 4. Objective
    const objAst =
      "quadTerms" in obj
        ? trans.translateQuadExpr(obj, solveGuards)
        : trans.translateLinExpr(obj, solveGuards);

    for (const g of solveGuards) {
      opt.add(g);
    }

    const sense = (modelData.sense || "MINIMIZE").toUpperCase();
    const objHandle = sense === "MAXIMIZE" ? opt.maximize(objAst) : opt.minimize(objAst);

    if (options.signal?.aborted) {
      return {
        status: "Unknown",
        terminationStatus: "Interrupted",
        hasPrimalSolution: false,
        objectiveValue: null,
        values: {},
        runTime: (performance.now() - solveStartTime) / 1000,
      };
    }

    const checkRes = await this.runZ3CheckWithErrorGuard(opt, instance);
    const statusStr = checkRes.toString();
    const solveElapsed = (performance.now() - solveStartTime) / 1000;

    if (statusStr === "sat") {
      const z3Model = opt.model();
      const values: Record<string, number> = {};
      const boolValues: Record<string, boolean> = {};

      for (const v of variables) {
        const vAst = trans.getVarAst(v);
        const val = z3Model.eval(vAst);
        setOwnProperty(values, v.name, trans.parseAstValue(val));
      }

      for (const bv of boolVars) {
        const bvAst = trans.getBoolVarAst(bv);
        const val = z3Model.eval(bvAst);
        const isTrue = val.toString() === "true";
        setOwnProperty(values, bv.name, isTrue ? 1 : 0);
        setOwnProperty(boolValues, bv.name, isTrue);
      }

      const objVal = trans.parseAstValue(z3Model.eval(objAst));
      let isUnbounded = false;
      let isUnattained = false;
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
        } else if (boundStr.includes("epsilon")) {
          isUnattained = true;
        }
      } catch {
        // Ignore if bound inspection is unavailable
      }

      const postSolveElapsed = (performance.now() - solveStartTime) / 1000;

      if (isUnbounded) {
        if (options.onProgress) {
          options.onProgress({
            elapsedTime: postSolveElapsed,
            elapsedSeconds: postSolveElapsed,
            ...(Number.isFinite(objVal) ? { objectiveValue: objVal } : {}),
          });
        }
        return {
          status: "Unbounded",
          terminationStatus: "Unbounded",
          hasPrimalSolution: true,
          objectiveValue: objVal,
          values,
          runTime: postSolveElapsed,
          ...(Object.keys(boolValues).length > 0 ? { boolValues } : {}),
        };
      }

      if (isUnattained) {
        if (options.onProgress) {
          options.onProgress({
            elapsedTime: postSolveElapsed,
            elapsedSeconds: postSolveElapsed,
          });
        }
        return {
          status: "Unknown",
          terminationStatus: "Unknown",
          hasPrimalSolution: false,
          objectiveValue: null,
          values: {},
          runTime: postSolveElapsed,
        };
      }

      if (options.onProgress) {
        options.onProgress({
          elapsedTime: postSolveElapsed,
          elapsedSeconds: postSolveElapsed,
          ...(Number.isFinite(objVal) ? { objectiveValue: objVal } : {}),
        });
      }

      return {
        status: "Optimal",
        terminationStatus: "Optimal",
        hasPrimalSolution: true,
        objectiveValue: objVal,
        values,
        runTime: postSolveElapsed,
        ...(Object.keys(boolValues).length > 0 ? { boolValues } : {}),
      };
    } else if (statusStr === "unsat") {
      if (options.onProgress) {
        options.onProgress({
          elapsedTime: solveElapsed,
          elapsedSeconds: solveElapsed,
        });
      }
      return {
        status: "Infeasible",
        terminationStatus: "Infeasible",
        hasPrimalSolution: false,
        objectiveValue: null,
        values: {},
        runTime: solveElapsed,
      };
    } else if (statusStr === "unknown") {
      if (options.onProgress) {
        options.onProgress({
          elapsedTime: solveElapsed,
          elapsedSeconds: solveElapsed,
        });
      }
      return {
        status: "Unknown",
        terminationStatus: "Unknown",
        hasPrimalSolution: false,
        objectiveValue: null,
        values: {},
        runTime: solveElapsed,
      };
    } else {
      return {
        status: "Error",
        terminationStatus: "Error",
        hasPrimalSolution: false,
        objectiveValue: null,
        values: {},
        runTime: solveElapsed,
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
