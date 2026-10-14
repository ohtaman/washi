import { describe, it, expect } from "vitest";
import {
  Model,
  c,
  expr,
  maximize,
  minimize,
  and,
  or,
  not,
  implies,
  xor,
  validateModelSolution,
} from "../src/index.js";

describe("Post-solve Solution Validation (Issue #54)", () => {
  it("validates feasible LP and MIP solutions within tolerance and returns valid: true, complete: true", async () => {
    const m = new Model("KnapsackMIP");
    const x = m.integer("x", { lb: 0, ub: 10 });
    const y = m.binary("y");
    const z = m.continuous("z", { lb: 0, ub: 20 });

    m.constraint(c`2 * ${x} + 5 * ${y} + ${z} <= 25`, "cap");
    m.constraint(c`${x} + ${z} >= 4`, "min_load");
    m.constraint(c`${z} == 2 * ${y} + 3`, "exact_z");
    m.objective(maximize(expr`10 * ${x} + 15 * ${y} + 2 * ${z}`));

    const status = await m.solve();
    expect(status).toBe("Optimal");

    const report = m.validateSolution();
    expect(report.valid).toBe(true);
    expect(report.complete).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.uncheckedConstraints).toEqual([]);
    expect(report.missingVariables).toEqual([]);
    expect(report.maxViolation).toBeLessThanOrEqual(1e-6);
    expect(report.summary).toEqual({
      checkedVariables: 3,
      totalVariables: 3,
      checkedBoolVariables: 0,
      totalBoolVariables: 0,
      checkedLinearConstraints: 3,
      totalLinearConstraints: 3,
      checkedLogicalConstraints: 0,
      totalLogicalConstraints: 0,
    });

    // Also accepts slightly perturbed values within feasibilityTolerance / integralityTolerance
    const nearReport = validateModelSolution(m, {
      values: {
        x: (x.value as number) - 5e-7,
        y: (y.value as number) + 4e-7,
        z: (z.value as number) + 2e-7,
      },
      feasibilityTolerance: 1e-5,
      integralityTolerance: 1e-6,
    });
    expect(nearReport.valid).toBe(true);
    expect(nearReport.complete).toBe(true);
  });

  it("detects lower bound, upper bound, integrality, and linear constraint (<=, >=, ==) violations", () => {
    const m = new Model("CorruptedValuesTest");
    const x = m.continuous("x", { lb: 2, ub: 10 });
    const k = m.integer("k", { lb: 0, ub: 5 });
    const b = m.binary("b");

    m.constraint(c`${x} + ${k} <= 8`, "le_cap");
    m.constraint(c`2 * ${x} - ${k} >= 6`, "ge_req");
    m.constraint(c`${k} + ${b} == 3`, "eq_target");

    const report = m.validateSolution({
      values: {
        x: 1.5, // violates lower bound 2 by 0.5; also 2*(1.5) - 4.4 = -1.4 < 6 (violates ge_req by 7.4)
        k: 4.4, // violates integrality by 0.4
        b: 1.2, // violates binary upper bound 1 by 0.2 and integrality by 0.2
      },
    });

    expect(report.valid).toBe(false);
    expect(report.complete).toBe(true);
    expect(report.violationsByName["x"].some((v) => v.type === "lower_bound")).toBe(true);
    expect(report.violationsByName["x"][0].violation).toBeCloseTo(0.5, 12);

    expect(report.violationsByName["k"].some((v) => v.type === "integrality")).toBe(true);
    expect(report.violationsByName["k"][0].violation).toBeCloseTo(0.4, 12);

    expect(report.violationsByName["b"].some((v) => v.type === "upper_bound")).toBe(true);
    expect(report.violationsByName["b"].some((v) => v.type === "integrality")).toBe(true);

    expect(report.violationsByName["ge_req"][0].type).toBe("linear_constraint");
    expect(report.violationsByName["ge_req"][0].violation).toBeCloseTo(7.4, 12);

    expect(report.violationsByName["eq_target"][0].type).toBe("linear_constraint");
    expect(report.violationsByName["eq_target"][0].violation).toBeCloseTo(2.6, 12);

    // Also test <= violation
    const leReport = m.validateSolution({
      values: { x: 7, k: 3, b: 0 },
    });
    expect(leReport.valid).toBe(false);
    expect(leReport.violationsByName["le_cap"][0].type).toBe("linear_constraint");
    expect(leReport.violationsByName["le_cap"][0].violation).toBeCloseTo(2, 12);
    expect(leReport.maxViolation).toBeCloseTo(2, 12);
  });

  it("never reports valid: true for missing, partial, or non-finite variable assignments", () => {
    const m = new Model("IncompleteTest");
    const x = m.continuous("x", { lb: 0, ub: 10 });
    const y = m.continuous("y", { lb: 0, ub: 10 });
    m.constraint(c`${x} + ${y} <= 10`, "sum_le");

    // 1. Before solve (all values null)
    const unsolvedReport = m.validateSolution();
    expect(unsolvedReport.valid).toBe(false);
    expect(unsolvedReport.complete).toBe(false);
    expect(unsolvedReport.missingVariables).toEqual(["x", "y"]);
    expect(unsolvedReport.uncheckedConstraints).toEqual(["sum_le"]);

    // 2. Partial values map (y missing)
    const partialReport = m.validateSolution({ values: { x: 4 } });
    expect(partialReport.valid).toBe(false);
    expect(partialReport.complete).toBe(false);
    expect(partialReport.missingVariables).toEqual(["y"]);
    expect(partialReport.uncheckedConstraints).toEqual(["sum_le"]);

    // 3. Non-finite value (NaN / Infinity)
    const nanReport = m.validateSolution({ values: { x: NaN, y: 3 } });
    expect(nanReport.valid).toBe(false);
    expect(nanReport.complete).toBe(false);
    expect(nanReport.violationsByName["x"][0].type).toBe("non_finite_value");
    expect(nanReport.uncheckedConstraints).toEqual(["sum_le"]);
  });

  it("evaluates logical (propositional and SMT) constraints and supports evaluateLogicalConstraints: false", async () => {
    await import("../src/modeler/solvers/z3/index.js");
    const m = new Model({ name: "LogicalValidation", solver: "z3" });
    const p = m.bool("p");
    const q = m.bool("q");
    const x = m.continuous("x", { lb: 0, ub: 20 });

    m.constraint(implies(p, c`${x} >= 10`), "imp_px");
    m.constraint(or(p, q), "or_pq");
    m.constraint(xor(p, not(q)), "equiv_pq");

    // Valid assignment: p = true, q = true, x = 12
    const validRep = m.validateSolution({
      values: { p: true, q: true, x: 12 },
    });
    expect(validRep.valid).toBe(true);
    expect(validRep.complete).toBe(true);
    expect(validRep.summary.checkedLogicalConstraints).toBe(3);

    // Violated assignment: p = true, q = true, x = 5 (violates imp_px)
    const invalidRep = m.validateSolution({
      values: { p: true, q: true, x: 5 },
    });
    expect(invalidRep.valid).toBe(false);
    expect(invalidRep.complete).toBe(true);
    expect(invalidRep.violationsByName["imp_px"][0].type).toBe("logical_constraint");

    // Polarity-aware tolerance check: if antecedent (x >= 10) is slightly false (x = 9.9999999 < 10),
    // implies(x >= 10, q) with q = false must still be recognized as satisfied!
    const mPol = new Model("PolarityTolerance");
    const u = mPol.continuous("u", { lb: 0, ub: 20 });
    const flag = mPol.bool("flag");
    mPol.constraint(implies(c`${u} >= 10`, flag), "imp_u_flag");
    const polReport = mPol.validateSolution({
      values: { u: 10 - 1e-7, flag: false },
      feasibilityTolerance: 1e-6,
    });
    expect(polReport.valid).toBe(true);

    // When evaluateLogicalConstraints is false, logical constraints are marked unchecked and valid/complete are false
    const skippedRep = m.validateSolution({
      values: { p: true, q: true, x: 12 },
      evaluateLogicalConstraints: false,
    });
    expect(skippedRep.valid).toBe(false);
    expect(skippedRep.complete).toBe(false);
    expect(skippedRep.uncheckedConstraints).toEqual(["imp_px", "or_pq", "equiv_pq"]);
  });

  it("validates Big-M indicator constraints", () => {
    const m = new Model("IndicatorValidation");
    const x = m.continuous("x", { lb: 0, ub: 100 });
    const z = m.binary("z");

    m.indicator(z, c`${x} <= 0`, { name: "ind_x0" });

    const reportInactive = m.validateSolution({
      values: { x: 80, z: 0 },
    });
    expect(reportInactive.valid).toBe(true);
    expect(reportInactive.complete).toBe(true);

    // Active indicator (z = 1, x = 5) violates x <= 0
    const reportActiveViolated = m.validateSolution({
      values: { x: 5, z: 1 },
    });
    expect(reportActiveViolated.valid).toBe(false);
    expect(reportActiveViolated.violationsByName["ind_x0"][0].type).toBe("linear_constraint");
    expect(reportActiveViolated.violationsByName["ind_x0"][0].violation).toBeCloseTo(5, 12);
  });

  it("rejects invalid tolerance options", () => {
    const m = new Model();
    m.continuous("x", { lb: 0, ub: 1 });
    expect(() => m.validateSolution({ feasibilityTolerance: -1e-6 })).toThrow(
      /Invalid feasibilityTolerance/
    );
    expect(() => m.validateSolution({ integralityTolerance: NaN })).toThrow(
      /Invalid integralityTolerance/
    );
  });

  it("handles prototype keys, variadic xor, tolerated maxViolation, and false negated atoms", async () => {
    // 1. Prototype-free violationsByName lookup (e.g. "constructor", "toString")
    const mProto = new Model("ProtoKeys");
    mProto.continuous("constructor", { lb: 0, ub: 1 });
    mProto.continuous("toString", { lb: 0, ub: 1 });
    const repProto = mProto.validateSolution();
    expect(repProto.valid).toBe(false);
    expect(repProto.violationsByName["constructor"][0].type).toBe("missing_value");
    expect(repProto.violationsByName["toString"][0].type).toBe("missing_value");

    // 2. Variadic xor(a, b, d) parity evaluation
    const mXor = new Model("VariadicXor");
    const a = mXor.bool("a");
    const b = mXor.bool("b");
    const d = mXor.bool("d");
    mXor.constraint(xor(a, b, d), "xor3");
    expect(mXor.validateSolution({ values: { a: true, b: true, d: true } }).valid).toBe(true);
    expect(mXor.validateSolution({ values: { a: true, b: true, d: false } }).valid).toBe(false);

    // 3. Includes tolerated residuals in maxViolation
    const mTol = new Model("ToleratedResidual");
    const xTol = mTol.continuous("xTol", { lb: 0, ub: 1 });
    mTol.constraint(c`${xTol} == 0`, "eq0");
    const repTol = mTol.validateSolution({
      values: { xTol: 5e-7 },
      feasibilityTolerance: 1e-6,
    });
    expect(repTol.valid).toBe(true);
    expect(repTol.maxViolation).toBeCloseTo(5e-7, 12);

    // 4. Excludes false logical atoms inside satisfied negations from maxViolation
    const mFalseAtom = new Model("FalseAtomPolarity");
    const xPol = mFalseAtom.continuous("xPol", { lb: 0, ub: 200 });
    mFalseAtom.add(not(xPol.le(0)), "neg_le");
    const repFalseAtom = mFalseAtom.validateSolution({
      values: { xPol: 100 },
    });
    expect(repFalseAtom.valid).toBe(true);
    expect(repFalseAtom.maxViolation).toBe(0);

    // 5. Excludes missing_value and unchecked_constraint from maxViolation
    const mUnsolved = new Model("UnsolvedMaxViolation");
    mUnsolved.continuous("xUnsolved", { lb: 0, ub: 10 });
    const repUnsolved = mUnsolved.validateSolution();
    expect(repUnsolved.valid).toBe(false);
    expect(repUnsolved.complete).toBe(false);
    expect(repUnsolved.maxViolation).toBe(0);

    // 6. Aligns variadic XOR (>2 children) between Z3 translation and validateSolution
    const mXorZ3 = new Model({ name: "VariadicXorZ3", solver: "z3" });
    const pA = mXorZ3.bool("pA");
    const pB = mXorZ3.bool("pB");
    const pC = mXorZ3.bool("pC");
    mXorZ3.add(xor(pA, pB, pC), "xor3");
    mXorZ3.add(pA, "force_a");
    mXorZ3.add(pB, "force_b");
    mXorZ3.add(pC, "force_c");
    const z3XorRes = await mXorZ3.check("z3");
    expect(z3XorRes.status).toBe("Sat");
    expect(mXorZ3.validateSolution().valid).toBe(true);
  });
});


