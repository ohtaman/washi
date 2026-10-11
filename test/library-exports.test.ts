import { describe, it, expect } from "vitest";
import {
  Model,
  Var,
  LinExpr,
  QuadExpr,
  Constraint,
  sum,
  HiGHS,
  MockSolver,
  LpProblem,
  LpVariable,
  MipModel,
  BoolVar,
  and,
  or,
  not,
  implies,
  xor,
  getSolver,
} from "../src/index.js";

describe("opt-ts Library Entry Point Exports", () => {
  it("exports all core modeler classes and default solvers from root", () => {
    expect(Model).toBeDefined();
    expect(Var).toBeDefined();
    expect(LinExpr).toBeDefined();
    expect(QuadExpr).toBeDefined();
    expect(Constraint).toBeDefined();
    expect(sum).toBeDefined();
    expect(HiGHS).toBeDefined();
    expect(MockSolver).toBeDefined();
    expect(LpProblem).toBeDefined();
    expect(LpVariable).toBeDefined();
    expect(MipModel).toBeDefined();
    expect(BoolVar).toBeDefined();
    expect(and).toBeDefined();
    expect(or).toBeDefined();
    expect(not).toBeDefined();
    expect(implies).toBeDefined();
    expect(xor).toBeDefined();
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
    const x = m.addVar({ name: "x", type: "Integer" });
    const y = m.addVar({ name: "y", type: "Integer" });

    m.maximize(x.mul(10).add(y.mul(20)));
    m.addConstraint(x.add(y).le(5));

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(100);
    expect(y.value).toBe(5);
    expect(x.value).toBe(0);
  });
});
