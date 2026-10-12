import { describe, it, expect } from "vitest";
import { Model } from "../src/modeler/model.js";
import { GLPKSolver } from "../src/modeler/solvers/glpk.js";
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
});
