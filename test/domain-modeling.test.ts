import { describe, it, expect } from "vitest";
import { Model, sum, dot, expr } from "../src/index.js";

describe("Domain-pure modeling API: binary, integer, continuous, dot, constrain, values", () => {
  it("creates single domain variables without fat options", () => {
    const m = new Model();
    const b = m.binary("flag");
    const i = m.integer("units", { lb: 1, ub: 10 });
    const c = m.continuous("rate", { lb: 0 });

    expect(b.name).toBe("flag");
    expect(b.type).toBe("Binary");
    expect(b.lb).toBe(0);
    expect(b.ub).toBe(1);

    expect(i.name).toBe("units");
    expect(i.type).toBe("Integer");
    expect(i.lb).toBe(1);
    expect(i.ub).toBe(10);

    expect(c.name).toBe("rate");
    expect(c.type).toBe("Continuous");
    expect(c.lb).toBe(0);
    expect(c.ub).toBe(Infinity);
  });

  it("creates multiple domain variables via count or key array with identical method names", () => {
    const m = new Model();

    // by count
    const binaries = m.binary(3); // x_0, x_1, x_2
    expect(binaries.length).toBe(3);
    expect(binaries[0].type).toBe("Binary");

    // by key list
    const items = ["laptop", "camera", "drone"];
    const x = m.binary(items);
    expect(Object.keys(x)).toEqual(["laptop", "camera", "drone"]);
    expect(x.laptop.type).toBe("Binary");

    // 2D matrix
    const warehouses = ["W1", "W2"];
    const customers = ["C1", "C2", "C3"];
    const flow = m.continuous(warehouses, customers, { lb: 0 });
    expect(flow.W1.C1.type).toBe("Continuous");
    expect(flow.W2.C3.type).toBe("Continuous");
  });

  it("computes inner product (dot) for 1D and 2D variables and coefficients", () => {
    const m = new Model();
    const x = m.binary(["apple", "banana"]);
    const profits = { apple: 10, banana: 25 };

    const expr1 = dot(profits, x);
    expect(expr1.terms.get(x.apple)).toBe(10);
    expect(expr1.terms.get(x.banana)).toBe(25);

    // Reversed order: dot(vars, coeffs)
    const expr2 = dot(x, profits);
    expect(expr2.terms.get(x.apple)).toBe(10);
    expect(expr2.terms.get(x.banana)).toBe(25);

    // 2D dot product (matrix dot product)
    const flow = m.continuous(["W1", "W2"], ["C1", "C2"]);
    const costMatrix = {
      W1: { C1: 4, C2: 7 },
      W2: { C1: 2, C2: 9 },
    };
    const totalCostExpr = dot(costMatrix, flow);
    expect(totalCostExpr.terms.get(flow.W1.C1)).toBe(4);
    expect(totalCostExpr.terms.get(flow.W1.C2)).toBe(7);
    expect(totalCostExpr.terms.get(flow.W2.C1)).toBe(2);
    expect(totalCostExpr.terms.get(flow.W2.C2)).toBe(9);
  });

  it("supports range count overload for sum(count, i => ...)", () => {
    const m = new Model();
    const vars = m.binary(5);

    const s = sum(5, (i) => vars[i].mul(i + 1));
    expect(s.terms.get(vars[0])).toBe(1);
    expect(s.terms.get(vars[1])).toBe(2);
    expect(s.terms.get(vars[4])).toBe(5);
  });

  it("solves standard knapsack problem using constrain() and values()", async () => {
    const m = new Model("KnapsackProduction");

    const items = [
      { name: "laptop", weight: 3, value: 50 },
      { name: "camera", weight: 2, value: 40 },
      { name: "drone", weight: 4, value: 65 },
    ];
    const capacity = 5;

    const x = m.binary(items.map((it) => it.name));

    // Objective: maximize dot(profit, x)
    const profits = Object.fromEntries(items.map((it) => [it.name, it.value]));
    m.maximize(dot(profits, x));

    // Constraints: constrain() with expr
    const weights = Object.fromEntries(items.map((it) => [it.name, it.weight]));
    m.constrain(expr`${dot(weights, x)} <= ${capacity}`, "capacity");

    const status = await m.optimize();

    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(90); // laptop (3, 50) + camera (2, 40) = 5 wt, 90 val

    // Extract values directly via m.getValues()
    const result = m.getValues(x);
    expect(result).toEqual({
      laptop: 1,
      camera: 1,
      drone: 0,
    });
  });

  it("supports chaining multiple m.constrain(...) calls fluently", async () => {
    const m = new Model("ChainedConstraints");
    const desks = m.integer("desks", { lb: 0 });
    const chairs = m.integer("chairs", { lb: 0 });

    m.maximize(expr`30 * ${desks} + 50 * ${chairs}`);

    // Fluent constrain
    m.constrain(expr`${desks} + 2 * ${chairs} <= 40`, "wood")
      .constrain(expr`2 * ${desks} + ${chairs} <= 50`, "labor");

    expect(m.numConstrs).toBe(2);

    const status = await m.optimize();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(1100);
    expect(m.getValues(desks)).toBe(20);
    expect(m.getValues(chairs)).toBe(10);
    expect(m.getValues([desks, chairs])).toEqual([20, 10]);
  });

  it("throws clear error when passing a LinExpr without comparison operator to constrain()", () => {
    const m = new Model();
    const x = m.continuous("x");
    expect(() => {
      m.constrain(expr`2 * ${x} + 5` as any);
    }).toThrow(/Cannot add a linear expression without a comparison operator/);
  });

  it("throws clear error when passing a Constraint to maximize()", () => {
    const m = new Model();
    const x = m.continuous("x");
    expect(() => {
      m.maximize(expr`${x} <= 10` as any);
    }).toThrow(/Cannot set objective to a constraint comparison/);
  });
});
