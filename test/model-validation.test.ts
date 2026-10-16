import { describe, it, expect, beforeAll } from "vitest";
import { Model, Constraint, LinExpr, expr, maximize, minimize, validateModelIntegrity } from "../src/index.js";

describe("Model Integrity Validation (Issue #51)", () => {
  beforeAll(async () => {
    await import("../src/modeler/solvers/glpk/index.js");
    await import("../src/modeler/solvers/z3/index.js");
  });

  describe("1. Foreign-model variable ownership (by object identity)", () => {
    it("rejects foreign variable in linear objective even when names match", () => {
      const m1 = new Model("ModelA");
      const m2 = new Model("ModelB");

      const x1 = m1.continuous("x", { lb: 0, ub: 10 });
      m2.continuous("x", { lb: 0, ub: 10 }); // Same name, different object identity

      expect(() => {
        m2.objective(maximize(expr`3 * ${x1} + 1`));
      }).toThrow(/Variable "x" in objective function does not belong to model "ModelB".*object identity/);
    });

    it("rejects foreign variable in quadratic objective", () => {
      const m1 = new Model("ModelA");
      const m2 = new Model("ModelB");

      const x1 = m1.continuous("x", { lb: 0, ub: 10 });
      const y2 = m2.continuous("y", { lb: 0, ub: 10 });

      expect(() => {
        m2.objective(minimize(x1.mul(y2)));
      }).toThrow(/Variable "x" in quadratic objective function does not belong to model "ModelB"/);

      expect(() => {
        m2.objective(minimize(y2.mul(x1)));
      }).toThrow(/Variable "x" in quadratic objective function does not belong to model "ModelB"/);
    });

    it("rejects foreign variable in arithmetic constraint even when names match", () => {
      const m1 = new Model("ModelA");
      const m2 = new Model("ModelB");

      const x1 = m1.continuous("x", { lb: 0, ub: 10 });
      const x2 = m2.continuous("x", { lb: 0, ub: 10 });

      expect(() => {
        m2.constraint(expr`${x1} + ${x2} <= 10`, "c_foreign");
      }).toThrow(/Variable "x" in constraint "c_foreign" does not belong to model "ModelB".*object identity/);
    });

    it("rejects foreign binary or continuous variable in indicator()", () => {
      const m1 = new Model("ModelA");
      const m2 = new Model("ModelB");

      const z1 = m1.binary("z");
      const x1 = m1.continuous("x", { lb: 0, ub: 10 });
      const z2 = m2.binary("z");
      const x2 = m2.continuous("x", { lb: 0, ub: 10 });

      // Foreign binary variable
      expect(() => {
        m2.indicator(z1, expr`${x2} <= 5`);
      }).toThrow(/Variable "z" passed to indicator\(\) does not belong to model "ModelB"/);

      // Foreign variable in indicator's linear constraint
      expect(() => {
        m2.indicator(z2, expr`${x1} <= 5`, { name: "ind_foreign" });
      }).toThrow(/Variable "x" in constraint "ind_foreign" does not belong to model "ModelB"/);
    });

    it("rejects foreign BoolVar and foreign Var in logical constraints", () => {
      const m1 = new Model("ModelA");
      const m2 = new Model("ModelB");

      const p1 = m1.bool("p");
      const x1 = m1.continuous("x", { lb: 0, ub: 10 });
      const p2 = m2.bool("p");

      expect(() => {
        m2.constraint(p1.and(p2), "logic_foreign_bool");
      }).toThrow(/Boolean variable "p" in logical constraint "logic_foreign_bool" does not belong to model "ModelB"/);

      expect(() => {
        m2.constraint(p2.implies(expr`${x1} <= 5`), "logic_foreign_var");
      }).toThrow(/Variable "x" embedded in logical constraint "logic_foreign_var" does not belong to model "ModelB"/);
    });

    it("catches post-construction foreign variable injection before solve() and check()", async () => {
      const m1 = new Model("ModelA");
      const m2 = new Model("ModelB");

      const x1 = m1.continuous("x", { lb: 0, ub: 10 });
      const x2 = m2.continuous("x", { lb: 0, ub: 10 });

      const constr = m2.continuous("y", { lb: 0, ub: 10 });
      m2.constraint(expr`${x2} + ${constr} <= 10`, "mutated_c");

      // Mutate internal terms map after construction to inject foreign variable x1
      m2.constraints[0].lhs.terms.set(x1, 2);

      await expect(m2.solve("highs")).rejects.toThrow(
        /Variable "x" in constraint "mutated_c" does not belong to model "ModelB"/
      );
      await expect(m2.solve("glpk")).rejects.toThrow(
        /Variable "x" in constraint "mutated_c" does not belong to model "ModelB"/
      );
      await expect(m2.solve("z3")).rejects.toThrow(
        /Variable "x" in constraint "mutated_c" does not belong to model "ModelB"/
      );
      await expect(m2.check("z3")).rejects.toThrow(
        /Variable "x" in constraint "mutated_c" does not belong to model "ModelB"/
      );
    });

    it("rejects adding a variable already owned by another model via add(Var) or mutable variables array", () => {
      const m1 = new Model("ModelA");
      const m2 = new Model("ModelB");
      const x1 = m1.continuous("x", { lb: 0, ub: 10 });

      expect(() => m2.add(x1)).toThrow(/Variable "x" already belongs to model "ModelA"/);
      expect(m2.variables).toHaveLength(0);

      // Direct push to mutable variables array must also be caught by validateModelIntegrity()
      m2.variables.push(x1);
      expect(() => validateModelIntegrity(m2)).toThrow(
        /Variable "x" is duplicated or not canonically registered in model "ModelB"/
      );
    });

    it("keeps equality indicator() atomic when second generated row overflows RHS", () => {
      const m = new Model("AtomicIndicatorOverflow");
      const b = m.binary("b");
      const x = m.continuous("x", { lb: -1e308, ub: 1e308 });

      expect(() => {
        m.indicator(b, x.eq(-1e308), { M: 1e308, name: "ovf" });
      }).toThrow(/invalid right-hand side \(RHS\): -Infinity|shifted right-hand side overflows finite floating-point range/);

      expect(m.constraints).toHaveLength(0);
      expect(m.getConstraintByName("ovf_le")).toBeUndefined();
    });
  });

  describe("2. Invalid bounds, coefficients, and RHS validation", () => {
    it("rejects NaN, +Infinity lower bound, -Infinity upper bound, and lb > ub", () => {
      const m = new Model("BoundsModel");

      expect(() => m.continuous("bad_lb_nan", { lb: NaN })).toThrow(
        /Variable "bad_lb_nan" has invalid lower bound/
      );
      expect(() => m.continuous("bad_lb_inf", { lb: Infinity })).toThrow(
        /Variable "bad_lb_inf" has invalid lower bound/
      );
      expect(() => m.continuous("bad_ub_nan", { ub: NaN })).toThrow(
        /Variable "bad_ub_nan" has invalid upper bound/
      );
      expect(() => m.continuous("bad_ub_neginf", { ub: -Infinity })).toThrow(
        /Variable "bad_ub_neginf" has invalid upper bound/
      );
      expect(() => m.continuous("inverted_bounds", { lb: 10, ub: 5 })).toThrow(
        /Variable "inverted_bounds" has invalid bounds: lower bound \(10\) is strictly greater than upper bound \(5\)/
      );
    });

    it("catches post-construction bound corruption before solve() and check()", async () => {
      const m = new Model("PostBoundsModel");
      const x = m.continuous("x", { lb: 0, ub: 10 });
      m.objective(maximize(x));

      // Mutate bound directly after creation
      x.lb = 20;

      await expect(m.solve("highs")).rejects.toThrow(
        /Variable "x" has invalid bounds: lower bound \(20\) is strictly greater than upper bound \(10\)/
      );
      await expect(m.solve("glpk")).rejects.toThrow(
        /Variable "x" has invalid bounds: lower bound \(20\) is strictly greater than upper bound \(10\)/
      );
      await expect(m.check("z3")).rejects.toThrow(
        /Variable "x" has invalid bounds: lower bound \(20\) is strictly greater than upper bound \(10\)/
      );
    });

    it("rejects non-finite objective coefficients and constants", () => {
      const m = new Model("ObjNumericModel");
      const x = m.continuous("x", { lb: 0, ub: 10 });

      expect(() => m.objective(maximize(x.mul(NaN)))).toThrow(
        /Variable "x" in objective function has invalid coefficient: NaN/
      );
      expect(() => m.objective(maximize(x.mul(Infinity)))).toThrow(
        /Variable "x" in objective function has invalid coefficient: Infinity/
      );
      expect(() => m.objective(maximize(x.add(NaN)))).toThrow(
        /Objective function has invalid constant: NaN/
      );
      expect(() => m.objective(maximize(x.add(Infinity)))).toThrow(
        /Objective function has invalid constant: Infinity/
      );
    });

    it("rejects non-finite constraint coefficients and RHS", () => {
      const m = new Model("ConstrNumericModel");
      const x = m.continuous("x", { lb: 0, ub: 10 });

      expect(() => m.constraint(x.le(NaN), "nan_rhs")).toThrow(
        /Constraint "nan_rhs" has invalid right-hand side \(RHS\): NaN/
      );
      expect(() => m.constraint(x.le(Infinity), "inf_rhs")).toThrow(
        /Constraint "inf_rhs" has invalid right-hand side \(RHS\): Infinity/
      );
      expect(() => m.constraint(x.ge(-Infinity), "neginf_rhs")).toThrow(
        /Constraint "neginf_rhs" has invalid right-hand side \(RHS\): -Infinity/
      );
      expect(() => m.constraint(x.mul(NaN).le(5), "nan_coeff")).toThrow(
        /Variable "x" in constraint "nan_coeff" has invalid coefficient: NaN/
      );
      expect(() => m.constraint(x.mul(Infinity).le(5), "inf_coeff")).toThrow(
        /Variable "x" in constraint "inf_coeff" has invalid coefficient: Infinity/
      );
    });
  });

  describe("3. Constraint identity and collision prevention", () => {
    it("prevents collision between named arithmetic and logical constraints", () => {
      const m = new Model("CollisionModel");
      const x = m.continuous("x", { lb: 0, ub: 10 });
      const p = m.bool("p");
      const q = m.bool("q");

      m.constraint(expr`${x} <= 5`, "shared_name");

      // Logical constraint with same name as arithmetic constraint must fail
      expect(() => {
        m.constraint(p.and(q), "shared_name");
      }).toThrow(/Constraint with name 'shared_name' already exists in model/);

      // Arithmetic constraint with same name as logical constraint must fail
      m.constraint(p.or(q), "logic_only_name");
      expect(() => {
        m.constraint(expr`${x} >= 1`, "logic_only_name");
      }).toThrow(/Constraint with name 'logic_only_name' already exists in model/);

      // Duplicate logical constraint name must fail
      expect(() => {
        m.constraint(p.implies(q), "logic_only_name");
      }).toThrow(/Constraint with name 'logic_only_name' already exists in model/);

      // Reusing an already-registered Constraint instance with a new name must fail without renaming it
      const cInst = x.le(8);
      m.constraint(cInst, "first_name");
      expect(() => {
        m.constraint(cInst, "second_name");
      }).toThrow(/Constraint "first_name" is already registered in model "CollisionModel"/);
      expect(cInst.name).toBe("first_name");
    });

    it("prevents collision with auto-generated logical constraint names", () => {
      const m = new Model("AutoCollisionModel");
      const x = m.continuous("x", { lb: 0, ub: 10 });
      const p = m.bool("p");
      const q = m.bool("q");

      // Unnamed logical constraint auto-generates "lc_1"
      m.constraint(p.and(q));
      expect(m.logicalConstraints[0].name).toBe("lc_1");

      // Explicit arithmetic constraint with name "lc_1" must be rejected
      expect(() => {
        m.constraint(expr`${x} <= 5`, "lc_1");
      }).toThrow(/Constraint with name 'lc_1' already exists in model/);

      // If an explicit arithmetic constraint reserves "lc_2" first, the next unnamed logical constraint skips to "lc_3"
      m.constraint(expr`${x} <= 5`, "lc_2");
      m.constraint(p.or(q));
      expect(m.logicalConstraints[1].name).toBe("lc_3");
    });

    it("catches post-construction duplicate constraint names via validateModelIntegrity()", () => {
      const m = new Model("MutatedNamesModel");
      const x = m.continuous("x", { lb: 0, ub: 10 });
      const p = m.bool("p");

      const c1 = m.continuous("y", { lb: 0, ub: 10 });
      m.constraint(expr`${x} <= 5`, "c_one");
      m.constraint(expr`${c1} <= 5`, "c_two");
      m.constraint(p.not(), "lc_one");

      // Mutate name to collide with logical constraint
      m.constraints[1].name = "lc_one";
      expect(() => validateModelIntegrity(m)).toThrow(
        /Conflicting constraint name "lc_one" across arithmetic and logical constraints/
      );

      // Mutate name to collide with arithmetic constraint
      m.constraints[1].name = "c_one";
      expect(() => validateModelIntegrity(m)).toThrow(
        /Duplicate constraint name "c_one" in model "MutatedNamesModel"/
      );
    });

    it("preflights logical constraint name collisions in equality indicator() without leaving partial rows", () => {
      const m = new Model("IndicatorLogicalCollision");
      const b = m.binary("b");
      const x = m.continuous("x", { lb: 0, ub: 10 });
      const p = m.bool("p");

      // Logical constraint owns "foo_ge"
      m.constraint(p.not(), "foo_ge");

      expect(() => {
        m.indicator(b, expr`${x} == 5`, { name: "foo" });
      }).toThrow(/Constraint with name 'foo_ge' already exists in model/);

      // Ensure "foo_le" was NOT partially inserted into the model
      expect(m.constraints.length).toBe(0);
      expect(m.getConstraintByName("foo_le")).toBeUndefined();
    });

    it("rejects non-number variable bounds and clears prior solution state when validation fails", async () => {
      const m = new Model("StaleStateOnInvalidBounds");
      const x = m.continuous("x", { lb: 0, ub: 10 });
      m.objective(maximize(expr`${x}`));

      expect(() => m.continuous("bad_str", { lb: "invalid" as any })).toThrow(
        /Variable "bad_str" has invalid lower bound/
      );
      expect(() => m.continuous("bad_null", { ub: null as any })).toThrow(
        /Variable "bad_null" has invalid upper bound/
      );

      const status = await m.solve();
      expect(status).toBe("Optimal");
      expect(x.value).toBeCloseTo(10, 5);

      // Mutate bound to invalid state after solve
      x.lb = 20;
      await expect(m.solve()).rejects.toThrow(/lower bound \(20\) is strictly greater than upper bound \(10\)/);

      // Prior solution state must be cleared
      expect(m.status).toBe("NotSolved");
      expect(m.objectiveValue).toBeNull();
      expect(m.solution).toBeNull();
      expect(x.value).toBeNull();

      // Mutate bound to non-number and verify check() also clears prior state and rejects
      x.lb = "invalid" as any;
      await expect(m.check()).rejects.toThrow(/invalid lower bound/);
      expect(m.status).toBe("NotSolved");
    });

    it("rejects BoolVar-constraint name collisions and embedded non-finite LHS constants", () => {
      const m = new Model("BoolVarAndEmbeddedCheck");
      const x = m.continuous("x", { lb: 0, ub: 10 });
      const p = m.bool("p");

      m.constraint(expr`${x} <= 5`, "con_a");

      // 1. Constraint name colliding with BoolVar name (and vice versa)
      expect(() => {
        m.constraint(p.not(), "p");
      }).toThrow(/conflicts with an existing Boolean variable/);
      expect(() => {
        m.constraint(expr`${x} <= 8`, "p");
      }).toThrow(/conflicts with an existing Boolean variable/);
      expect(() => {
        m.bool("con_a");
      }).toThrow(/conflicts with an existing constraint/);

      // Unnamed m.bool() skips existing constraint names
      m.constraint(expr`${x} <= 9`, "p_0");
      const autoBool = m.bool();
      expect(autoBool.name).toBe("p_1");

      // 2. Embedded Constraint with non-finite lhs.constant inside BoolExpr
      const badEmbedded = new Constraint(new LinExpr(new Map([[x, 1]]), NaN), "<=", 5, "bad_emb");
      expect(() => {
        m.constraint(p.implies(badEmbedded), "lc_bad_emb");
      }).toThrow(/invalid LHS constant: NaN/);
      expect(m.logicalConstraints.length).toBe(0);
    });

    it("preserves constraint names with spaces in unsatCore", async () => {
      const mUnsat = new Model({ name: "Z3QuotedConstraintNames", solver: "z3" });
      const x = mUnsat.continuous("x", { lb: 0, ub: 100 });
      mUnsat.constraint(expr`${x} <= 10`, "budget limit");
      mUnsat.constraint(expr`${x} >= 50`, "minimum requirement");
      const unsatRes = await mUnsat.check();
      expect(unsatRes.status).toBe("Unsat");
      expect(mUnsat.conflicts).toEqual(expect.arrayContaining(["budget limit", "minimum requirement"]));
    });
  });

  describe("4. Valid free and one-sided-unbounded variables across HiGHS, GLPK, and Z3", () => {
    it.each(["highs", "glpk", "z3"] as const)(
      "solves models with free and one-sided-unbounded variables in %s",
      async (solverName) => {
        const m = new Model({ name: `UnboundedVars_${solverName}`, solver: solverName });

        // Free variable: -Infinity <= freeVar <= +Infinity
        const freeVar = m.continuous("freeVar", { lb: -Infinity, ub: Infinity });
        // Upper-unbounded variable: 0 <= posVar <= +Infinity
        const posVar = m.continuous("posVar", { lb: 0, ub: Infinity });
        // Lower-unbounded variable: -Infinity <= negVar <= -5
        const negVar = m.continuous("negVar", { lb: -Infinity, ub: -5 });

        m.constraint(expr`${freeVar} == -12`, "fix_free");
        m.constraint(expr`${posVar} <= 20`, "bound_pos");
        m.constraint(expr`${negVar} >= -15`, "bound_neg");

        // Maximize posVar + freeVar + negVar => 20 + (-12) + (-5) = 3
        m.objective(maximize(expr`${posVar} + ${freeVar} + ${negVar}`));

        const status = await m.solve();
        expect(status).toBe("Optimal");
        expect(m.objectiveValue).toBeCloseTo(3, 5);
        expect(freeVar.value).toBeCloseTo(-12, 5);
        expect(posVar.value).toBeCloseTo(20, 5);
        expect(negVar.value).toBeCloseTo(-5, 5);
      }
    );
  });
});
