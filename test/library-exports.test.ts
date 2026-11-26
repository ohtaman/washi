import { describe, it, expect } from "vitest";
import * as WashiRoot from "../src/index.js";
import {
  Model,
  Var,
  LinExpr,
  QuadExpr,
  Constraint,
  sum,
  dot,
  expr,
  maximize,
  minimize,
  MockSolver,
  BoolVar,
  and,
  or,
  not,
  implies,
  xor,
  abs,
  max,
  min,
  at,
  distinct,
  disjoint,
  cumulative,
  allowed,
  GlobalConstraint,
  getSolver,
  listAvailableSolvers,
  buildLpSymbolMaps,
  isLpExportResult,
  sanitizeIdentifier,
  normalizeSense,
} from "../src/index.js";

describe("WaSHI Library Entry Point Exports", () => {
  it("exports core modeler and solver-agnostic registry from root and excludes solver-specific and retired helpers", () => {
    expect(Model).toBeDefined();
    expect(Var).toBeDefined();
    expect(LinExpr).toBeDefined();
    expect(QuadExpr).toBeDefined();
    expect(Constraint).toBeDefined();
    expect(sum).toBeDefined();
    expect(dot).toBeDefined();
    expect(expr).toBeDefined();
    expect(maximize).toBeDefined();
    expect(minimize).toBeDefined();
    expect(MockSolver).toBeDefined();
    expect(BoolVar).toBeDefined();
    expect(and).toBeDefined();
    expect(or).toBeDefined();
    expect(not).toBeDefined();
    expect(implies).toBeDefined();
    expect(xor).toBeDefined();
    expect(abs).toBeDefined();
    expect(max).toBeDefined();
    expect(min).toBeDefined();
    expect(at).toBeDefined();
    expect(distinct).toBeDefined();
    expect(disjoint).toBeDefined();
    expect(cumulative).toBeDefined();
    expect(allowed).toBeDefined();
    expect(GlobalConstraint).toBeDefined();
    expect(getSolver).toBeDefined();
    expect(listAvailableSolvers).toBeDefined();
    expect(buildLpSymbolMaps).toBeDefined();
    expect(isLpExportResult).toBeDefined();
    expect(sanitizeIdentifier).toBeDefined();

    // Bundled HiGHS and Pumpkin are both auto-registered from root, with HiGHS as default
    expect(listAvailableSolvers()).toEqual(expect.arrayContaining(["highs", "pumpkin", "mock"]));
    expect(getSolver().name).toBe("HiGHS");

    // Engine-specific APIs live under @ohtaman/washi/solvers/* rather than root
    expect((WashiRoot as any).HighsSolver).toBeUndefined();
    expect((WashiRoot as any).HiGHS).toBeUndefined();
    expect((WashiRoot as any).Highs).toBeUndefined();
    expect((WashiRoot as any).getHighs).toBeUndefined();
    expect((WashiRoot as any).solveLpWithHighs).toBeUndefined();
    expect((WashiRoot as any).setHighsWasmUrl).toBeUndefined();
    expect((WashiRoot as any).getHighsWasmUrl).toBeUndefined();
    expect((WashiRoot as any).PumpkinSolver).toBeUndefined();
    expect((WashiRoot as any).setPumpkinWasmUrl).toBeUndefined();
    expect((WashiRoot as any).getPumpkinWasmUrl).toBeUndefined();

    // Retired root aliases and internal WASM probe helpers must not be exported from root
    expect((WashiRoot as any).c).toBeUndefined();
    expect((WashiRoot as any).OFFICIAL_HIGHS_CDN_WASM_URL).toBeUndefined();
    expect((WashiRoot as any).isValidWasmHeader).toBeUndefined();
    expect((WashiRoot as any).probeWasmUrl).toBeUndefined();
    expect((WashiRoot as any).resolveBrowserWasmUrl).toBeUndefined();
    expect((WashiRoot as any).validateModelSolution).toBeUndefined();
    expect((WashiRoot as any).validateModelIntegrity).toBeUndefined();
  });

  it("exports HiGHS, Pumpkin, GLPK, and Z3 solvers symmetrically under solvers/* subpaths", async () => {
    const highsModule = await import("../src/modeler/solvers/highs.js");
    expect(highsModule.HighsSolver).toBeDefined();
    expect(highsModule.HiGHS).toBeDefined();
    expect(highsModule.Highs).toBeDefined();
    expect(highsModule.registerHighsSolver).toBeDefined();
    expect(highsModule.setHighsWasmUrl).toBeDefined();
    expect(highsModule.getHighsWasmUrl).toBeDefined();
    expect(highsModule.getHighs).toBeDefined();
    expect(highsModule.solveLpWithHighs).toBeDefined();

    const pumpkinModule = await import("../src/modeler/solvers/pumpkin.js");
    expect(pumpkinModule.PumpkinSolver).toBeDefined();
    expect(pumpkinModule.registerPumpkinSolver).toBeDefined();
    expect(pumpkinModule.setPumpkinWasmUrl).toBeDefined();
    expect(pumpkinModule.getPumpkinWasmUrl).toBeDefined();

    const glpkModule = await import("../src/modeler/solvers/glpk.js");
    expect(glpkModule.GLPKSolver).toBeDefined();
    expect(glpkModule.registerGLPKSolver).toBeDefined();

    const z3Module = await import("../src/modeler/solvers/z3.js");
    expect(z3Module.Z3Solver).toBeDefined();
    expect(z3Module.registerZ3Solver).toBeDefined();
  });

  it("can formulate and solve both MIP (HiGHS) and CP (Pumpkin) using only root exports", async () => {
    const m = new Model("RootExportTest");
    const x = m.integer("x", { lb: 0 });
    const y = m.integer("y", { lb: 0 });

    m.objective(maximize(x.mul(10).add(y.mul(20))));
    m.constraint(x.add(y).le(5));

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(100);
    expect(y.value).toBe(5);
    expect(x.value).toBe(0);

    const cp = new Model("RootPumpkinTest", { solver: "pumpkin" });
    const a = cp.integer("a", { lb: 1, ub: 4 });
    const b = cp.integer("b", { lb: 1, ub: 4 });
    cp.constraint(distinct([a, b]), "diff");
    cp.objective(maximize(a.add(b)));
    expect(await cp.solve()).toBe("Optimal");
    expect(cp.objectiveValue).toBe(7);
  });

  it("retires redundant aliases on Model, Var, LinExpr, and QuadExpr and rejects invalid runtime VarType / OptimizationSense literals", () => {
    const m = new Model("CanonicalSurfaceTest");
    const x = m.continuous("x");
    const lin = x.add(1);
    const quad = x.mul(x);

    // Retired Model methods & properties
    for (const retiredMember of [
      "constrain",
      "optimize",
      "maximize",
      "minimize",
      "setObjective",
      "add",
      "vars",
      "constrs",
      "getValues",
      "validateSolution",
      "validateIntegrity",
      "addColumn",
      "getVarByName",
      "getBoolVarByName",
      "getConstraintByName",
      "getLogicalConstraintByName",
      "boolVars",
      "logicalConstraints",
      "numVars",
      "numConstrs",
      "objectiveExpr",
      "notifyMutation",
      "resetSolutionState",
      "relGap",
      "mipGap",
      "absGap",
    ] as const) {
      expect(Reflect.get(m, retiredMember)).toBeUndefined();
      expect(retiredMember in m).toBe(false);
    }

    // Canonical Model methods & properties exist
    expect(typeof m.constraint).toBe("function");
    expect(typeof m.objective).toBe("function");
    expect(typeof m.solve).toBe("function");
    expect(typeof m.verify).toBe("function");
    expect(typeof m.column).toBe("function");
    expect(typeof m.toLpString).toBe("function");
    expect("relativeGap" in m).toBe(true);
    expect("absoluteGap" in m).toBe(true);
    expect(m.relativeGap).toBeUndefined();
    expect(m.absoluteGap).toBeUndefined();
    expect(m.conflicts).toBeUndefined();
    expect(m.unsatCore).toBeUndefined();
    expect("conflicts" in m).toBe(true);
    expect("unsatCore" in m).toBe(true);

    // Unified ReadonlyMap collections: variables, constraints, values
    const b = m.bool("flag");
    expect(b.type).toBe("Boolean");
    const cLin = m.constraint(x.le(10), "c_lin");
    const cLog = m.constraint(b.implies(x.le(5)), "c_log");
    expect(cLog).toBeDefined();

    for (const mapView of [m.variables, m.constraints, m.values] as any[]) {
      expect(Array.isArray(mapView)).toBe(false);
      expect(typeof mapView.get).toBe("function");
      expect(typeof mapView.has).toBe("function");
      expect(typeof mapView.size).toBe("number");
      expect(typeof mapView.keys).toBe("function");
      expect(typeof mapView.values).toBe("function");
      expect(typeof mapView.entries).toBe("function");
      expect(typeof mapView[Symbol.iterator]).toBe("function");
      expect(typeof mapView.forEach).toBe("function");
      expect(mapView.set).toBeUndefined();
      expect(mapView.delete).toBeUndefined();
      expect(mapView.clear).toBeUndefined();
      expect(mapView.push).toBeUndefined();
    }

    expect(m.variables.size).toBe(2);
    expect([...m.variables.keys()]).toEqual(["x", "flag"]);
    expect(m.variables.get("x")).toBe(x);
    expect(m.variables.get("flag")).toBe(b);
    expect(m.variables.has("flag")).toBe(true);
    const iteratedVars: string[] = [];
    m.variables.forEach((v, k) => {
      iteratedVars.push(`${k}:${v.type}`);
    });
    expect(iteratedVars).toEqual(["x:Continuous", "flag:Boolean"]);

    expect(m.constraints.size).toBe(2);
    expect([...m.constraints.keys()]).toEqual(["c_lin", "c_log"]);
    expect(m.constraints.get("c_lin")).toBe(cLin);
    const storedLog = m.constraints.get("c_log");
    expect(storedLog).toBeDefined();
    expect(Object.isFrozen(storedLog)).toBe(true);
    expect(storedLog && "kind" in storedLog ? storedLog.kind : undefined).toBe("logical");
    expect(storedLog?.dual).toBeNull();
    expect(storedLog?.slack).toBeNull();

    // Retired comparison and value aliases on Var, LinExpr, and QuadExpr
    for (const target of [x, lin, quad] as any[]) {
      expect(target.lessThanOrEqual).toBeUndefined();
      expect(target.greaterThanOrEqual).toBeUndefined();
      expect(target.equalTo).toBeUndefined();
      expect(target.getValue).toBeUndefined();
    }

    // Strict runtime validation for OptimizationSense and VarType
    // @ts-expect-error invalid runtime OptimizationSense literal
    expect(() => normalizeSense("bogus")).toThrow(/Invalid optimization sense/);
    expect(() => new Model({ sense: "InvalidSense" as any })).toThrow(/Invalid optimization sense/);
    expect(() => {
      // @ts-expect-error invalid runtime OptimizationSense assignment
      m.sense = "bogus";
    }).toThrow(/Invalid optimization sense/);
    expect(() => {
      // @ts-expect-error empty runtime OptimizationSense literal
      m.objective({ expr: x, sense: "" });
    }).toThrow(/Invalid optimization sense/);
    expect(() => {
      // @ts-expect-error null runtime OptimizationSense literal
      m.objective({ expr: x, sense: null });
    }).toThrow(/Invalid optimization sense/);
    expect(() => new Var({ name: "bad", type: "SemiContinuous" as any })).toThrow(/Invalid variable type/);
    expect(new Var({ type: "integer" }).type).toBe("Integer");
    expect(() => {
      x.type = "InvalidType" as any;
    }).toThrow(/Invalid variable type/);
  });

  it("supports uniform m.constraints.get(name)?.dual and ?.slack access across LP, MIP, and logical/CP models", async () => {
    // 1. LP model: numeric dual and slack via unified ReadonlyMap
    const lp = new Model("DualSlackLP");
    const xLp = lp.continuous("x", { lb: 0, ub: 10 });
    lp.constraint(expr`${xLp} <= 4`, "cap");
    lp.objective(maximize(expr`3 * ${xLp}`));
    expect(await lp.solve()).toBe("Optimal");
    expect(lp.constraints.get("cap")?.dual).toBeCloseTo(3, 6);
    expect(lp.constraints.get("cap")?.slack).toBeCloseTo(0, 6);

    // 2. MIP model with linearized logical constraint: linear Constraint exposes null dual (no MIP duals) and numeric slack,
    //    while LogicalConstraint entries uniformly expose null for both dual and slack
    const mip = new Model("DualSlackMIP");
    const xMip = mip.integer("x", { lb: 0, ub: 10 });
    const flag = mip.bool("flag");
    mip.constraint(expr`${xMip} <= 6`, "cap_int");
    mip.constraint(flag.implies(expr`${xMip} >= 2`), "logic_min");
    mip.constraint(flag, "force_flag");
    mip.objective(maximize(expr`5 * ${xMip}`));
    expect(await mip.solve()).toBe("Optimal");
    expect(mip.constraints.get("cap_int")?.dual).toBeNull();
    expect(mip.constraints.get("cap_int")?.slack).toBeCloseTo(0, 6);
    expect(mip.constraints.get("logic_min")?.dual).toBeNull();
    expect(mip.constraints.get("logic_min")?.slack).toBeNull();
    expect(mip.constraints.get("force_flag")?.dual).toBeNull();
    expect(mip.constraints.get("force_flag")?.slack).toBeNull();
  });
});
