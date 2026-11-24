import { describe, expect, it } from "vitest";
import { Model, expr, and, or, not, implies, maximize } from "../src/index.js";
import "../src/modeler/solvers/glpk/index.js";

describe("Issue #258: linearizer general Constraints in and()/or()/implies() and root name preservation", () => {
  it("handles direct Constraint (including non-zero lhs.constant) inside top-level and() on HiGHS and GLPK", async () => {
    for (const solver of ["highs", "glpk"] as const) {
      const m = new Model({ solver });
      const flag = m.bool("flag");
      const x = m.integer("x", { lb: 0, ub: 20 });
      m.constraint(and(flag, expr`${x} + 2 <= 7`), "flag_and_cap");
      m.objective(maximize(x));

      const status = await m.solve();
      expect(status).toBe("Optimal");
      expect(flag.value).toBe(true);
      expect(x.value).toBe(5);
    }
  });

  it("supports positive-polarity Continuous constraint inside or(..., implies(...)) on HiGHS and GLPK", async () => {
    for (const solver of ["highs", "glpk"] as const) {
      // Case 1: bypass = 0, armed = 1 => power <= 25.5 must hold
      const m1 = new Model({ solver });
      const bypass1 = m1.bool("bypass");
      const armed1 = m1.bool("armed");
      const power1 = m1.continuous("power", { lb: 0, ub: 100 });
      m1.constraint(or(bypass1, armed1.implies(expr`${power1} <= 25.5`)), "cap_policy");
      m1.constraint(not(bypass1), "no_bypass");
      m1.constraint(armed1, "is_armed");
      m1.objective(maximize(power1));

      const s1 = await m1.solve();
      expect(s1).toBe("Optimal");
      expect(power1.value).toBeCloseTo(25.5, 6);

      // Case 2: bypass = 1, armed = 1 => power can reach 100
      const m2 = new Model({ solver });
      const bypass2 = m2.bool("bypass");
      const armed2 = m2.bool("armed");
      const power2 = m2.continuous("power", { lb: 0, ub: 100 });
      m2.constraint(or(bypass2, armed2.implies(expr`${power2} <= 25.5`)), "cap_policy");
      m2.constraint(bypass2, "with_bypass");
      m2.constraint(armed2, "is_armed");
      m2.objective(maximize(power2));

      const s2 = await m2.solve();
      expect(s2).toBe("Optimal");
      expect(power2.value).toBeCloseTo(100, 6);

      // Case 3: check() consistency
      const chk = await m1.check();
      expect(chk.status).toBe("Sat");
    }
  });

  it("supports positive-polarity Continuous constraint inside implies(trigger, or(...)) and nested implies() on HiGHS", async () => {
    const m = new Model({ solver: "highs" });
    const trigger = m.bool("trigger");
    const bypass = m.bool("bypass");
    const armed = m.bool("armed");
    const power = m.continuous("power", { lb: 0, ub: 100 });
    const aux = m.continuous("aux", { lb: 0, ub: 50 });

    m.constraint(implies(trigger, or(bypass, expr`${power} <= 25.5`)), "trig_or_cap");
    m.constraint(implies(trigger, armed.implies(expr`${aux} <= 12.5`)), "trig_imp_cap");
    m.constraint(trigger);
    m.constraint(not(bypass));
    m.constraint(armed);
    m.objective(maximize(expr`${power} + ${aux}`));

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(power.value).toBeCloseTo(25.5, 6);
    expect(aux.value).toBeCloseTo(12.5, 6);
  });

  it("supports positive-polarity Continuous constraint inside not(implies(..., not(...))) and or(..., and(...))", async () => {
    const m = new Model({ solver: "highs" });
    const bypass = m.bool("bypass");
    const armed = m.bool("armed");
    const power = m.continuous("power", { lb: 0, ub: 100 });
    const aux = m.continuous("aux", { lb: 0, ub: 50 });

    m.constraint(or(bypass, and(armed, expr`${power} <= 25.5`)), "or_and_cap");
    m.constraint(not(implies(armed, not(expr`${aux} <= 12.5`))), "double_neg_imp");
    m.constraint(not(bypass));
    m.objective(maximize(expr`${power} + ${aux}`));

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(armed.value).toBe(true);
    expect(power.value).toBeCloseTo(25.5, 6);
    expect(aux.value).toBeCloseTo(12.5, 6);
  });

  it("preserves registered root constraint name in m.check() conflicts across and() and implies(..., and(...))", async () => {
    for (const solver of ["highs", "glpk"] as const) {
      const m1 = new Model({ solver });
      const flag1 = m1.bool("flag");
      const x1 = m1.integer("x", { lb: 0, ub: 20 });
      m1.constraint(and(flag1, expr`${x1} <= 5`), "rule");
      m1.constraint(expr`${x1} >= 10`, "lower_bound_1");
      m1.constraint(expr`${x1} >= 12`, "lower_bound_2");

      const chk1 = await m1.check();
      expect(chk1.status).toBe("Unsat");
      expect(chk1.conflicts).toContain("rule");
      expect(chk1.conflicts).not.toContain("rule_and_0");
      expect(chk1.conflicts).not.toContain("rule_and_1");

      const m2 = new Model({ solver });
      const x2 = m2.integer("x", { lb: 10, ub: 20 });
      const y2 = m2.integer("y", { lb: 0, ub: 20 });
      m2.constraint(implies(expr`${x2} >= 10`, and(expr`${x2} <= 5`, expr`${y2} <= 5`)), "imp_rule");

      const chk2 = await m2.check();
      expect(chk2.status).toBe("Unsat");
      expect(chk2.conflicts).toContain("imp_rule");
      expect(chk2.conflicts).not.toContain("imp_rule_and_0");
      expect(chk2.conflicts).not.toContain("imp_rule_and_1");
    }
  });

  it("deduplicates generated auxiliary constraint names against baseConstraints", async () => {
    const m = new Model({ solver: "highs" });
    const flag = m.bool("flag");
    const x = m.integer("x", { lb: 0, ub: 20 });
    const c0 = m.constraint(expr`${x} >= 1`, "rule_and_0");
    const c1 = m.constraint(expr`${x} >= 2`, "rule_and_1");
    m.constraint(and(flag, expr`${x} <= 5`), "rule");
    m.objective(maximize(x));

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(x.value).toBe(5);
    expect(c0.slack).not.toBeNull();
    expect(c1.slack).not.toBeNull();
  });
});
