import { describe, it, expect } from "vitest";
import { Model, sum, expr, maximize } from "../src/modeler/index.js";

describe("HiGHS Web Modeler", () => {
  it("solves standard MIP production planning problem (chairs and tables)", async () => {
    const m = new Model({ name: "ProductionPlanning", sense: "Maximize" });

    const chairs = m.integer("chairs", { lb: 0 });
    const tables = m.integer("tables", { lb: 0 });

    // Objective: Maximize 30 * chairs + 50 * tables
    m.objective(maximize(chairs.mul(30).add(tables.mul(50))));

    // Constraints:
    // carpentry: chairs + 2 * tables <= 40
    m.constraint(chairs.add(tables.mul(2)).le(40), "carpentry");
    // finishing: 2 * chairs + tables <= 50
    m.constraint(chairs.mul(2).add(tables).le(50), "finishing");

    const status = await m.solve();

    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(1100);
    expect(chairs.value).toBe(20);
    expect(tables.value).toBe(10);
  });

  it("solves using string formula constraints and objectives", async () => {
    const m = new Model({ name: "StringModel", sense: "Maximize" });
    m.integer("chairs", { lb: 0 });
    m.integer("tables", { lb: 0 });

    m.objective(maximize("30 * chairs + 50 * tables"));
    m.constraint("chairs + 2 * tables <= 40", "carpentry");
    m.constraint("2 * chairs + tables <= 50", "finishing");

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(1100);
    expect(m.getVarByName("chairs")?.value).toBe(20);
    expect(m.getVarByName("tables")?.value).toBe(10);
  });

  it("supports tagged template literal DSL: expr`...`", async () => {
    const m = new Model({ name: "TemplateModel" });
    const x = m.continuous("x", { lb: 0 });
    const y = m.continuous("y", { lb: 0 });

    // Maximize 2*x + 3*y
    m.objective(maximize(expr`2 * ${x} + 3 * ${y}`));
    m.constraint(expr`${x} + ${y} <= 4`);
    m.constraint(expr`${x} + 2 * ${y} <= 6`);

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBeCloseTo(10, 5);
    expect(x.value).toBeCloseTo(2, 5);
    expect(y.value).toBeCloseTo(2, 5);
  });

  it("solves 0-1 Knapsack problem using sum()", async () => {
    const m = new Model({ name: "Knapsack", sense: "Maximize" });

    const items = [
      { name: "laptop", weight: 3, value: 50 },
      { name: "camera", weight: 2, value: 40 },
      { name: "book", weight: 1, value: 10 },
      { name: "water", weight: 2, value: 25 },
    ];
    const capacity = 5;

    const x = m.binary(items.map((it) => it.name));

    // Objective: sum(value * x)
    m.objective(maximize(sum(items, (it) => x[it.name].mul(it.value))));

    // Weight constraint: sum(weight * x) <= capacity
    m.constraint(
      sum(items, (it) => x[it.name].mul(it.weight)).le(capacity),
      "capacity_limit"
    );

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(90); // laptop (3, 50) + camera (2, 40) = wt 5, val 90
    expect(x["laptop"].value).toBe(1);
    expect(x["camera"].value).toBe(1);
    expect(x["book"].value).toBe(0);
    expect(x["water"].value).toBe(0);
  });

  it("supports domain-pure integer variables and constraint() API", async () => {
    const m = new Model("PureProblem");
    const x = m.integer("chairs", { lb: 0 });
    const y = m.integer("tables", { lb: 0 });

    m.objective(maximize(x.mul(30).add(y.mul(50))));
    m.constraint(x.add(y.mul(2)).le(40));
    m.constraint(x.mul(2).add(y).le(50));

    await m.solve();

    expect(m.status).toBe("Optimal");
    expect(m.objectiveValue).toBe(1100);
    expect(x.value).toBe(20);
    expect(y.value).toBe(10);
    expect(m.getValues([x, y])).toEqual([20, 10]);
  });

  it("handles multi-dimensional variables with m.binary(rows, cols)", async () => {
    const m = new Model({ name: "GridModel" });
    const rows = ["R1", "R2"];
    const cols = ["C1", "C2"];
    const x = m.binary(rows, cols);

    // Each row has exactly one 1
    for (const r of rows) {
      m.constraint(sum(cols, (c) => x[r][c]).eq(1), `row_${r}`);
    }
    // Each col has exactly one 1
    for (const c of cols) {
      m.constraint(sum(rows, (r) => x[r][c]).eq(1), `col_${c}`);
    }

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.numVars).toBe(4);
    expect(m.numConstrs).toBe(4);
  });

  it("clears Var values when re-running solve() transitioning from Optimal to Infeasible", async () => {
    const m = new Model({ name: "ReRunInfeasible" });
    const x = m.continuous("x", { lb: 0, ub: 10 });
    m.objective(maximize(x));
    m.constraint(x.ge(5), "c1");

    const status1 = await m.solve();
    expect(status1).toBe("Optimal");
    expect(x.value).toBe(10);
    expect(m.values.get("x")).toBe(10);

    // Add impossible constraint
    m.constraint(x.ge(20), "c2");
    const status2 = await m.solve();
    expect(status2).toBe("Infeasible");
    expect(x.value).toBe(null);
    expect(m.values.size).toBe(0);
  });
});

