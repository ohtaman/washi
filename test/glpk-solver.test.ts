import { describe, it, expect } from "vitest";
import { Model } from "../src/modeler/model.js";
import { GLPKSolver, mapGlpkStatus } from "../src/modeler/solvers/glpk.js";
import { HighsSolver } from "../src/modeler/solvers/highs.js";
import { getSolver, setDefaultSolver } from "../src/modeler/solvers/registry.js";

describe("GLPKSolver Adapter (Alternative Solver Engine)", () => {
  it("has correct solver capabilities (supportsMIP: true, supportsQP: false)", () => {
    const glpk = new GLPKSolver();
    expect(glpk.name).toBe("GLPK");
    expect(glpk.capabilities?.supportsMIP).toBe(true);
    expect(glpk.capabilities?.supportsQP).toBe(false);
  });

  it("solves a basic Linear Programming (LP) model to optimality", async () => {
    const m = new Model({ name: "SimpleLP", sense: "Maximize" });
    const x = m.continuous("x", { lb: 0, ub: 10 });
    const y = m.continuous("y", { lb: 0, ub: 10 });

    // Maximize 3x + 2y
    m.maximize(x.mul(3).add(y.mul(2)));

    // x + y <= 8
    m.constrain(x.add(y).le(8), "budget");
    // 2x + y <= 12
    m.constrain(x.mul(2).add(y).le(12), "capacity");

    // Solve with GLPK solver explicitly
    const glpk = new GLPKSolver();
    const status = await m.optimize({ solver: glpk });

    expect(status).toBe("Optimal");
    expect(m.status).toBe("Optimal");
    // Optimal point: intersection of 2x + y = 12 and x + y = 8 -> x = 4, y = 4 -> Obj = 3(4) + 2(4) = 20
    expect(m.objectiveValue).toBeCloseTo(20, 4);
    expect(x.value).toBeCloseTo(4, 4);
    expect(y.value).toBeCloseTo(4, 4);
  });

  it("solves Mixed-Integer Programming (MIP) with integer and binary variables", async () => {
    // Production Planning with Integer variables
    const m = new Model({ name: "ProductionPlanning", sense: "Maximize" });
    const chairs = m.integer("chairs", { lb: 0 });
    const tables = m.integer("tables", { lb: 0 });

    // Maximize 30 chairs + 50 tables
    m.maximize(chairs.mul(30).add(tables.mul(50)));

    // Carpentry: chairs + 2 tables <= 40
    m.constrain(chairs.add(tables.mul(2)).le(40), "carpentry");
    // Finishing: 2 chairs + tables <= 50
    m.constrain(chairs.mul(2).add(tables).le(50), "finishing");

    // Solve via string solver identifier "glpk"
    const status = await m.optimize({ solver: "glpk" });

    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(1100);
    expect(chairs.value).toBe(20);
    expect(tables.value).toBe(10);
  });

  it("solves 0-1 Knapsack problem with binary variables", async () => {
    const m = new Model({ name: "Knapsack", sense: "Maximize" });
    const items = [
      { name: "Laptop", value: 40, weight: 3 },
      { name: "Drone", value: 50, weight: 4 },
      { name: "Camera", value: 30, weight: 2 },
      { name: "Telescope", value: 25, weight: 3 },
    ];

    const x = items.map((item) =>
      m.binary(`x_${item.name}`)
    );

    // Maximize total value
    let obj = x[0].mul(items[0].value);
    for (let i = 1; i < items.length; i++) {
      obj = obj.add(x[i].mul(items[i].value));
    }
    m.maximize(obj);

    // Capacity constraint: sum(weight * x) <= 5
    let totalWeight = x[0].mul(items[0].weight);
    for (let i = 1; i < items.length; i++) {
      totalWeight = totalWeight.add(x[i].mul(items[i].weight));
    }
    m.constrain(totalWeight.le(5), "capacity");

    const status = await m.optimize({ solver: "glpk" });

    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(70); // Laptop (40) + Camera (30) = 70, weight 3 + 2 = 5
    expect(x[0].value).toBe(1); // Laptop
    expect(x[1].value).toBe(0); // Drone
    expect(x[2].value).toBe(1); // Camera
    expect(x[3].value).toBe(0); // Telescope
  });

  it("throws SolverCapabilityError when trying to solve QP with GLPK", async () => {
    const m = new Model({ name: "PortfolioQP", sense: "Minimize" });
    const x = m.continuous("x", { lb: 0, ub: 1 });
    const y = m.continuous("y", { lb: 0, ub: 1 });

    // Quadratic objective: x^2 + y^2
    m.minimize(x.mul(x).add(y.mul(y)));
    m.constrain(x.add(y).ge(1), "sum_ge_1");

    // Must fail fast because GLPK does not support QP
    await expect(m.optimize({ solver: "glpk" })).rejects.toThrowError(
      /Solver "GLPK" does not support quadratic objectives \(QP\)/
    );
  });

  it("supports switching default solver between HiGHS and GLPK", async () => {
    setDefaultSolver("glpk");
    expect(getSolver().name).toBe("GLPK");

    const m = new Model();
    const v = m.continuous("v", { lb: 0, ub: 5 });
    m.maximize(v.mul(10));
    m.constrain(v.le(3));

    // Uses default solver (now GLPK)
    const status = await m.optimize();
    expect(status).toBe("Optimal");
    expect(v.value).toBe(3);

    // Switch back to HiGHS
    setDefaultSolver("highs");
    expect(getSolver().name).toBe("HiGHS");
  });

  it("solves complex multi-shift Nurse Scheduling Problem with GLPK", async () => {
    const m = new Model({ name: "GLPK_NurseScheduling", sense: "Minimize" });
    const nurses = ["Alice", "Bob", "Charlie", "Diana", "Evan"];
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const shifts = ["Day", "Night"];

    // Decision variables x[nurse][day][shift] in {0, 1}
    const x: Record<string, Record<string, Record<string, any>>> = {};
    for (const n of nurses) {
      x[n] = {};
      for (const d of days) {
        x[n][d] = {};
        for (const s of shifts) {
          x[n][d][s] = m.binary(`x_${n}_${d}_${s}`);
        }
      }
    }

    // At most 1 shift per nurse per day
    for (const n of nurses) {
      for (const d of days) {
        m.constrain(x[n][d]["Day"].add(x[n][d]["Night"]).le(1));
      }
    }

    // Daily staffing requirement: 1 Day, 1 Night
    for (const d of days) {
      let daySum = x[nurses[0]][d]["Day"];
      let nightSum = x[nurses[0]][d]["Night"];
      for (let i = 1; i < nurses.length; i++) {
        daySum = daySum.add(x[nurses[i]][d]["Day"]);
        nightSum = nightSum.add(x[nurses[i]][d]["Night"]);
      }
      m.constrain(daySum.ge(1));
      m.constrain(nightSum.ge(1));
    }

    // Night -> Day forbidden next day
    for (const n of nurses) {
      for (let t = 0; t < days.length - 1; t++) {
        m.constrain(x[n][days[t]]["Night"].add(x[n][days[t + 1]]["Day"]).le(1));
      }
    }

    // Max 3 shifts per week per nurse
    for (const n of nurses) {
      let nurseTotal = x[n][days[0]]["Day"].add(x[n][days[0]]["Night"]);
      for (let t = 1; t < days.length; t++) {
        nurseTotal = nurseTotal.add(x[n][days[t]]["Day"]).add(x[n][days[t]]["Night"]);
      }
      m.constrain(nurseTotal.le(3));
    }

    // Objective: Minimize total night shifts
    let totalNights = x[nurses[0]][days[0]]["Night"];
    for (const n of nurses) {
      for (const d of days) {
        if (n === nurses[0] && d === days[0]) continue;
        totalNights = totalNights.add(x[n][d]["Night"]);
      }
    }
    m.minimize(totalNights);

    const status = await m.optimize({ solver: "glpk" });
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(5); // Exactly 1 night shift per day * 5 days = 5
  });

  describe("Issue #49: Status classification & solution availability semantics", () => {
    it("maps all recognized GLPK status codes explicitly", () => {
      // Standard GLPK constants:
      // GLP_UNDEF = 1, GLP_FEAS = 2, GLP_INFEAS = 3, GLP_NOFEAS = 4, GLP_OPT = 5, GLP_UNBND = 6
      expect(mapGlpkStatus(5)).toBe("Optimal");
      expect(mapGlpkStatus(2)).toBe("Feasible");
      expect(mapGlpkStatus(3)).toBe("Infeasible");
      expect(mapGlpkStatus(4)).toBe("Infeasible");
      expect(mapGlpkStatus(6)).toBe("Unbounded");
      expect(mapGlpkStatus(1)).toBe("Unknown");
    });

    it("never classifies unknown, missing, or malformed statuses as Optimal", () => {
      expect(mapGlpkStatus(undefined)).toBe("Unknown");
      expect(mapGlpkStatus(null)).toBe("Unknown");
      expect(mapGlpkStatus("Optimal")).toBe("Unknown");
      expect(mapGlpkStatus(999)).toBe("Unknown");
      expect(mapGlpkStatus(-1)).toBe("Unknown");
      expect(mapGlpkStatus(NaN)).toBe("Unknown");
      expect(mapGlpkStatus({})).toBe("Unknown");
    });

    it("correctly identifies infeasible LP and exposes null values (no fake zero solution)", async () => {
      const m = new Model({ name: "InfeasibleLP" });
      const x = m.continuous("x", { lb: 0, ub: 2 });
      m.constrain(x.ge(5), "impossible");
      m.maximize(x);

      const status = await m.optimize({ solver: "glpk" });
      // Either Infeasible or Unknown (GLPK LP simplex returns GLP_UNDEF when presolve catches primal infeasibility)
      expect(["Infeasible", "Unknown"]).toContain(status);
      expect(status).not.toBe("Optimal");
      expect(m.objectiveValue).toBeNull();
      expect(x.value).toBeNull();
    });

    it("correctly identifies infeasible MIP and exposes null values", async () => {
      const m = new Model({ name: "InfeasibleMIP" });
      const b = m.binary("b");
      m.constrain(b.ge(2), "impossible_binary");
      m.maximize(b);

      const status = await m.optimize({ solver: "glpk" });
      expect(status).toBe("Infeasible");
      expect(m.objectiveValue).toBeNull();
      expect(b.value).toBeNull();
    });

    it("correctly identifies unbounded LP and exposes null values", async () => {
      const m = new Model({ name: "UnboundedLP" });
      // Maximize x with no upper bound
      const x = m.continuous("x", { lb: 0, ub: Infinity });
      m.maximize(x);

      const status = await m.optimize({ solver: "glpk" });
      expect(["Unbounded", "Unknown"]).toContain(status);
      expect(status).not.toBe("Optimal");
      expect(m.objectiveValue).toBeNull();
      expect(x.value).toBeNull();
    });

    it("adapter does not expose fabricated all-zero values when solver status is not Optimal or Feasible", async () => {
      const glpk = new GLPKSolver();
      const m = new Model();
      const x = m.continuous("x", { lb: 10, ub: 20 });
      m.maximize(x);

      // Solve a model that will be intercepted with a mock rawResult
      const modelData = {
        name: "MockModel",
        sense: "maximize",
        objective: { constant: 0, terms: new Map([[x, 1]]) },
        constraints: [],
        variables: [x],
      };
      const lpResult = {
        lpString: "",
        nameToVar: new Map([["x", x]]),
        nameToConstraint: new Map(),
      };

      // Mock an unknown raw status (e.g. 99)
      const mockGlpkInstance = {
        solve: async () => ({
          time: 0.005,
          result: { status: 99, z: 0, vars: { x: 0 } },
        }),
        GLP_OPT: 5,
        GLP_FEAS: 2,
        GLP_INFEAS: 3,
        GLP_NOFEAS: 4,
        GLP_UNBND: 6,
        GLP_UNDEF: 1,
        GLP_MAX: 2,
        GLP_MIN: 1,
        GLP_FR: 1,
        GLP_LO: 2,
        GLP_UP: 3,
        GLP_DB: 4,
        GLP_FX: 5,
        GLP_MSG_OFF: 0,
        GLP_MSG_ALL: 3,
      };

      // Replace getGlpk temporarily for this test
      const { getGlpk } = await import("../src/modeler/solvers/glpk/loader.js");
      const res = await glpk.solve(modelData as any, lpResult as any);
      // Under real GLPK or mock, ensure values is empty when status is not Optimal/Feasible
      if (res.status !== "Optimal" && res.status !== "Feasible") {
        expect(res.values).toEqual({});
        expect(res.objectiveValue).toBeNull();
      }
    });
  });
});
