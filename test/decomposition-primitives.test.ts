import { describe, it, expect } from "vitest";
import { Model, expr, minimize, maximize, HighsSolver } from "../src/index.js";

describe("Decomposition Primitives (Column Injection, Terms, Shadow Prices, LP Relaxation)", () => {
  it("provides shadowPrice as an alias for constraint dual", async () => {
    const m = new Model("ShadowPriceTest");
    const x = m.continuous("x", { lb: 0 });
    const y = m.continuous("y", { lb: 0 });

    m.objective(maximize(expr`3 * ${x} + 2 * ${y}`));
    m.constraint(expr`${x} + ${y} <= 4`, "capacity");
    m.constraint(expr`${x} <= 2`, "x_limit");

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(10); // x=2, y=2 -> 3*2 + 2*2 = 10

    const c1 = m.getConstraintByName("capacity")!;
    const c2 = m.getConstraintByName("x_limit")!;

    // Dual values (shadow prices)
    expect(c1.dual).not.toBeNull();
    expect(c1.shadowPrice).toBe(c1.dual);
    expect(c2.shadowPrice).toBe(c2.dual);
    expect(c1.shadowPrice).toBeCloseTo(2, 4);
    expect(c2.shadowPrice).toBeCloseTo(1, 4);
  });

  it("dynamically modifies constraint terms with addTerm and setTerm", async () => {
    const m = new Model("DynamicTermsTest");
    const x = m.continuous("x", { lb: 0 });
    const y = m.continuous("y", { lb: 0 });

    m.objective(maximize(expr`2 * ${x} + ${y}`));
    m.constraint(expr`${x} <= 10`, "limit");
    const c = m.getConstraintByName("limit")!;

    // Add y with coefficient 3 to the constraint
    c.addTerm(y, 3);
    expect(c.lhs.terms.get(y)).toBe(3);

    // Overwrite y's coefficient to 2 with setTerm
    c.setTerm(y, 2);
    expect(c.lhs.terms.get(y)).toBe(2);

    // Solve with updated constraint: x + 2y <= 10
    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(x.value).toBeCloseTo(10, 4);
    expect(y.value).toBeCloseTo(0, 4);

    // Remove y by setting coefficient to 0
    c.setTerm(y, 0);
    expect(c.lhs.terms.has(y)).toBe(false);
  });

  it("injects dynamic columns via model.column() with Record, Map, and Array coefficients", async () => {
    const m = new Model("ColumnInjectionTest");
    m.constraint(expr`0 <= 10`, "res1");
    m.constraint(expr`0 <= 15`, "res2");
    const c1 = m.getConstraintByName("res1")!;
    const c2 = m.getConstraintByName("res2")!;
    m.objective(maximize(0));

    // Column 1: Record coefficient specification
    const col1 = m.column({
      name: "col1",
      cost: 5,
      lb: 0,
      ub: 10,
      coefficients: {
        res1: 2,
        res2: 1,
      },
    });
    expect(col1.name).toBe("col1");
    expect(c1.lhs.terms.get(col1)).toBe(2);
    expect(c2.lhs.terms.get(col1)).toBe(1);

    // Column 2: Map coefficient specification
    const coeffMap = new Map();
    coeffMap.set(c1, 1);
    coeffMap.set("res2", 3);
    const col2 = m.column({
      name: "col2",
      cost: 6,
      lb: 0,
      coefficients: coeffMap,
    });
    expect(c1.lhs.terms.get(col2)).toBe(1);
    expect(c2.lhs.terms.get(col2)).toBe(3);

    // Column 3: Array of tuples
    const col3 = m.addColumn({
      name: "col3",
      cost: 4,
      lb: 0,
      coefficients: [
        [c1, 1],
        [c2, 1],
      ],
    });
    expect(c1.lhs.terms.get(col3)).toBe(1);
    expect(c2.lhs.terms.get(col3)).toBe(1);

    const status = await m.solve();
    expect(status).toBe("Optimal");
    // Maximize 5*col1 + 6*col2 + 4*col3
    // s.t. 2*col1 + col2 + col3 <= 10
    //      col1 + 3*col2 + col3 <= 15
    expect(m.objectiveValue).toBeGreaterThan(0);
    expect(m.solution.duals.res1).toBeGreaterThanOrEqual(0);
    expect(m.solution.duals.res2).toBeGreaterThanOrEqual(0);
  });

  it("solves continuous LP relaxation of MIP models via model.relax()", async () => {
    const m = new Model("RelaxationTest");
    // Binary variables
    const x = m.binary("x");
    const y = m.binary("y");

    // Standard MIP where continuous relaxation gives 1.5, while integer gives 1
    m.objective(maximize(expr`${x} + ${y}`));
    m.constraint(expr`2 * ${x} + 2 * ${y} <= 3`, "knapsack");

    // 1. Solve LP relaxation
    const relaxStatus = await m.relax();
    expect(relaxStatus).toBe("Optimal");
    // In continuous relaxation: x=1, y=0.5 -> obj = 1.5
    expect(m.objectiveValue).toBeCloseTo(1.5, 4);
    expect(m.solution.duals.knapsack).toBeCloseTo(0.5, 4);

    // 2. Solve true MIP
    const mipStatus = await m.solve();
    expect(mipStatus).toBe("Optimal");
    // In integer programming: x + y <= 1 -> obj = 1
    expect(m.objectiveValue).toBe(1);
    expect(Math.round(x.value! + y.value!)).toBe(1);
  });

  it("throws a descriptive error when adding a column with non-existent constraint name", () => {
    const m = new Model("NonExistentConstraintTest");
    expect(() => {
      m.column({
        name: "invalid_col",
        cost: 1,
        coefficients: {
          missing_constraint: 5,
        },
      });
    }).toThrow("Constraint 'missing_constraint' not found in model when adding column");
  });

  it("honors constructor-level relax option in HighsSolver", async () => {
    const solver = new HighsSolver({ relax: true });
    const m = new Model("ConstructorRelaxTest");
    const x = m.integer("x", { lb: 0, ub: 10 });
    m.objective(maximize(x));
    m.constraint(expr`${x} <= 1.5`, "limit");

    const status = await m.solve(solver);
    expect(status).toBe("Optimal");
    // With relax: true, optimal value is 1.5 rather than truncated integer 1
    expect(m.objectiveValue).toBeCloseTo(1.5, 4);
    expect(x.value).toBeCloseTo(1.5, 4);
  });
});
