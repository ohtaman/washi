import { describe, it, expect } from "vitest";
import { Model, expr, minimize, xor, implies } from "../src/index.js";
import "../src/modeler/solvers/glpk/index.js";

describe("HiGHS & GLPK SMT / Logic Linearization & Elastic Conflicts Check", () => {
  it("solves SAT boolean logic and implication on HiGHS via automatic MIP linearization", async () => {
    const m = new Model({ name: "HiGHS_SAT_TaskScheduling", solver: "highs" });

    const taskA_s1 = m.bool("taskA_s1");
    const taskA_s2 = m.bool("taskA_s2");
    const hours = m.integer("hours", { lb: 1, ub: 8 });

    // Exclusive OR: task A must run on either server 1 or server 2
    m.constraint(xor(taskA_s1, taskA_s2), "taskA_server_xor");

    // Implication: If task A is on server 2, hours >= 4
    m.constraint(taskA_s2.implies(hours.ge(4)), "s2_overtime_rule");

    // Force task A onto server 2
    m.constraint(taskA_s2, "force_s2");

    const res = await m.check();

    expect(res.status).toBe("Sat");
    expect(taskA_s2.value).toBe(true);
    expect(taskA_s1.value).toBe(false);
    expect(hours.value).toBeGreaterThanOrEqual(4);
    expect(res.conflicts).toBeUndefined();
    expect(res.unsatCore).toBeUndefined();
  });

  it("identifies conflicting constraints in UNSAT models on HiGHS via elastic slack check", async () => {
    const m = new Model({ name: "HiGHS_ConflictDiagnosis", solver: "highs" });

    const engineers = m.integer("engineers", { lb: 0, ub: 20 });
    const budget = m.continuous("budget", { lb: 0, ub: 100000 });
    const rush = m.bool("rushDelivery");

    // Rule 1: engineers * 8000 <= budget
    m.constraint(engineers.mul(8000).le(budget), "budget_limit");

    // Rule 2: Client strictly requires rush delivery
    m.constraint(rush, "rush_required");

    // Rule 3: Rush delivery requires at least 8 engineers (8 * 8000 = 64,000)
    m.constraint(rush.implies(engineers.ge(8)), "rush_staffing_rule");

    // Rule 4: Board budget cap: $50,000 (Conflicts with 8 engineers costing $64,000!)
    m.constraint(budget.le(50000), "strict_board_budget_cap");

    // Rule 5: Completely innocent bystander rule
    m.constraint(engineers.ge(1), "minimum_one_employee");

    const res = await m.check();

    expect(res.status).toBe("Unsat");
    expect(m.status).toBe("Unsat");
    expect(res.conflicts).toBeDefined();
    expect(res.conflicts!.length).toBeGreaterThan(0);

    // The conflicts must include at least one of the contradictory rules, and should NOT blame the innocent rule
    const conflictSet = new Set(res.conflicts);
    const hasCoreConflict =
      conflictSet.has("strict_board_budget_cap") ||
      conflictSet.has("rush_staffing_rule") ||
      conflictSet.has("budget_limit") ||
      conflictSet.has("rush_required");

    expect(hasCoreConflict).toBe(true);
    // Innocent rule is satisfied by engineers >= 8, so it should not be in the minimal relaxation
    expect(conflictSet.has("minimum_one_employee")).toBe(false);

    // unsatCore must remain undefined on HiGHS to avoid semantic confusion with exact SMT core
    expect(res.unsatCore).toBeUndefined();
    expect(m.unsatCore).toBeUndefined();
  });

  it("solves optimization problems with logical constraints via m.solve() on HiGHS", async () => {
    const m = new Model({ name: "HiGHS_Logical_Optimize", solver: "highs" });

    const openCenter = m.binary("openCenter");
    const capacity = m.continuous("capacity", { lb: 0, ub: 100 });

    // Center opening setup cost: $500, unit cost: $10
    m.objective(minimize(openCenter.mul(500).add(capacity.mul(10))));

    // If center is open, must handle at least 40 units; if closed, capacity is 0
    m.constraint(openCenter.eq(1).implies(capacity.ge(40)), "min_batch");
    m.constraint(openCenter.eq(0).implies(capacity.le(0)), "closed_has_zero_capacity");

    // Customer demand requires at least 30 units total
    m.constraint(capacity.ge(30), "customer_demand");

    const status = await m.solve();

    expect(status).toBe("Optimal");
    expect(openCenter.value).toBe(1);
    // Because openCenter is true, capacity must be at least 40
    expect(capacity.value).toBeCloseTo(40, 2);
    // Objective: 500 * 1 + 10 * 40 = 900
    expect(m.objectiveValue).toBeCloseTo(900, 2);
  });

  it("supports the same workflow seamlessly on GLPK solver", async () => {
    const m = new Model({ name: "GLPK_SAT_Check", solver: "glpk" });

    const flagA = m.bool("flagA");
    const flagB = m.bool("flagB");
    const val = m.integer("val", { lb: 0, ub: 10 });

    m.constraint(flagA, "require_a");
    m.constraint(flagA.implies(flagB), "a_implies_b");
    m.constraint(flagB.implies(val.ge(5)), "b_requires_val_ge_5");

    const res = await m.check();

    expect(res.status).toBe("Sat");
    expect(flagA.value).toBe(true);
    expect(flagB.value).toBe(true);
    expect(val.value).toBeGreaterThanOrEqual(5);
  });

  it("preserves variadic parity XOR semantics on HiGHS (odd number of true operands)", async () => {
    // 1. Three true operands: true ^ true ^ true == true (SAT)
    const mOdd = new Model({ solver: "highs" });
    const a = mOdd.bool("a");
    const b = mOdd.bool("b");
    const c = mOdd.bool("c");
    mOdd.constraint(a);
    mOdd.constraint(b);
    mOdd.constraint(c);
    mOdd.constraint(xor(a, b, c), "three_way_xor");
    const resOdd = await mOdd.check();
    expect(resOdd.status).toBe("Sat");
    expect(a.value).toBe(true);
    expect(b.value).toBe(true);
    expect(c.value).toBe(true);

    // 2. Two true operands: true ^ true ^ false == false (UNSAT)
    const mEven = new Model({ solver: "highs" });
    const x = mEven.bool("x");
    const y = mEven.bool("y");
    const z = mEven.bool("z");
    mEven.constraint(x);
    mEven.constraint(y);
    mEven.constraint(z.not());
    mEven.constraint(xor(x, y, z), "even_xor_unsat");
    const resEven = await mEven.check();
    expect(resEven.status).toBe("Unsat");
    expect(resEven.conflicts).toBeDefined();
  });

  it("requires proof before returning Unsat from an elastic check (returns Unknown on inconclusive stops)", async () => {
    const m = new Model("TestInconclusive");
    const x = m.continuous("x", { lb: 0, ub: 10 });
    m.constraint(x.ge(5), "min_x");

    // Mock solver stopping due to TimeLimit with positive objective incumbent but no proven lower bound
    const timeLimitIncumbentSolver = {
      name: "MockTimeLimitSolver",
      capabilities: { supportsMIP: true },
      async solve() {
        return {
          status: "TimeLimit" as const,
          terminationStatus: "TimeLimit" as const,
          objectiveValue: 4.2, // Positive incumbent slack
          // No objectiveBound: 0 is not excluded!
          values: { x: 2 },
        };
      },
    };

    const resIncumbent = await m.check(timeLimitIncumbentSolver);
    expect(resIncumbent.status).toBe("Unknown");
    expect(resIncumbent.conflicts).toBeUndefined();

    // Mock solver stopping with proven objectiveBound > 1e-5 (proves infeasibility!)
    const timeLimitProvenBoundSolver = {
      name: "MockProvenBoundSolver",
      capabilities: { supportsMIP: true },
      async solve() {
        return {
          status: "TimeLimit" as const,
          terminationStatus: "TimeLimit" as const,
          objectiveValue: 4.2,
          objectiveBound: 1.5, // Dual bound proves min sum(slack) >= 1.5 > 1e-5!
          values: { __slack_1: 4.2 },
        };
      },
    };

    const resProven = await m.check(timeLimitProvenBoundSolver);
    expect(resProven.status).toBe("Unsat");
    expect(resProven.conflicts).toContain("min_x");
  });
});
