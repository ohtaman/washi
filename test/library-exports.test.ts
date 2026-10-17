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
  HiGHS,
  MockSolver,
  BoolVar,
  and,
  or,
  not,
  implies,
  xor,
  getSolver,
  setHighsWasmUrl,
  getHighsWasmUrl,
  getHighs,
  buildLpSymbolMaps,
  isLpExportResult,
  sanitizeIdentifier,
} from "../src/index.js";

describe("opt-ts Library Entry Point Exports", () => {
  it("exports all core modeler classes and default solvers from root and excludes retired diagnostic helpers", () => {
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
    expect(HiGHS).toBeDefined();
    expect(MockSolver).toBeDefined();
    expect(BoolVar).toBeDefined();
    expect(and).toBeDefined();
    expect(or).toBeDefined();
    expect(not).toBeDefined();
    expect(implies).toBeDefined();
    expect(xor).toBeDefined();
    expect(getSolver).toBeDefined();
    expect(setHighsWasmUrl).toBeDefined();
    expect(getHighsWasmUrl).toBeDefined();
    expect(getHighs).toBeDefined();
    expect(buildLpSymbolMaps).toBeDefined();
    expect(isLpExportResult).toBeDefined();
    expect(sanitizeIdentifier).toBeDefined();

    // Retired root aliases and internal WASM probe helpers must not be exported from root
    expect((WashiRoot as any).c).toBeUndefined();
    expect((WashiRoot as any).OFFICIAL_HIGHS_CDN_WASM_URL).toBeUndefined();
    expect((WashiRoot as any).isValidWasmHeader).toBeUndefined();
    expect((WashiRoot as any).probeWasmUrl).toBeUndefined();
    expect((WashiRoot as any).resolveBrowserWasmUrl).toBeUndefined();
  });

  it("exports GLPK and Z3 solvers as separate plugins", async () => {
    const glpkModule = await import("../src/modeler/solvers/glpk.js");
    expect(glpkModule.GLPKSolver).toBeDefined();
    expect(glpkModule.registerGLPKSolver).toBeDefined();

    const z3Module = await import("../src/modeler/solvers/z3.js");
    expect(z3Module.Z3Solver).toBeDefined();
    expect(z3Module.registerZ3Solver).toBeDefined();
  });

  it("can formulate and solve a simple MIP using only root exports", async () => {
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
  });

  it("retires redundant aliases on Model, Var, LinExpr, and QuadExpr and rejects invalid runtime VarType / OptimizationSense literals", () => {
    const m = new Model("CanonicalSurfaceTest");
    const x = m.continuous("x");
    const lin = x.add(1);
    const quad = x.mul(x);

    // Retired Model methods & properties
    expect((m as any).constrain).toBeUndefined();
    expect((m as any).optimize).toBeUndefined();
    expect((m as any).maximize).toBeUndefined();
    expect((m as any).minimize).toBeUndefined();
    expect((m as any).setObjective).toBeUndefined();
    expect((m as any).add).toBeUndefined();
    expect((m as any).vars).toBeUndefined();
    expect((m as any).constrs).toBeUndefined();

    // Canonical Model methods & properties exist
    expect(typeof m.constraint).toBe("function");
    expect(typeof m.objective).toBe("function");
    expect(typeof m.solve).toBe("function");
    expect(Array.isArray(m.variables)).toBe(true);
    expect(Array.isArray(m.constraints)).toBe(true);
    expect(m.conflicts).toBeUndefined();
    expect(m.unsatCore).toBeUndefined();
    expect("conflicts" in m).toBe(true);
    expect("unsatCore" in m).toBe(true);

    // Retired comparison and value aliases on Var, LinExpr, and QuadExpr
    for (const target of [x, lin, quad] as any[]) {
      expect(target.lessThanOrEqual).toBeUndefined();
      expect(target.greaterThanOrEqual).toBeUndefined();
      expect(target.equalTo).toBeUndefined();
      expect(target.getValue).toBeUndefined();
    }

    // Strict runtime validation for OptimizationSense and VarType
    expect(() => new Model({ sense: "InvalidSense" as any })).toThrow(/Invalid optimization sense/);
    expect(() => new Var({ name: "bad", type: "SemiContinuous" as any })).toThrow(/Invalid variable type/);
    expect(() => {
      x.type = "InvalidType" as any;
    }).toThrow(/Invalid variable type/);
  });
});
