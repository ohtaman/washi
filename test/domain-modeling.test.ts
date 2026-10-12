import { describe, it, expect } from "vitest";
import { Model, sum, dot, expr, LinExpr, QuadExpr } from "../src/index.js";

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

  it("normalizes lowercase sense 'maximize' and 'minimize' in Model and LP export", async () => {
    const m = new Model({ sense: "maximize" });
    const x = m.continuous("x", { lb: 0, ub: 10 });
    m.setObjective(x, "maximize");
    expect(m.sense).toBe("Maximize");
    expect(m.toLpString()).toMatch(/^Maximize/im);

    const m2 = new Model({ sense: "minimize" });
    const y = m2.continuous("y", { lb: 0, ub: 10 });
    m2.setObjective(y, "minimize");
    expect(m2.sense).toBe("Minimize");
    expect(m2.toLpString()).toMatch(/^Minimize/im);
  });

  it("throws error on dot() array length mismatch and dictionary key mismatch", () => {
    const m = new Model();
    const x = m.continuous(3); // 3 variables
    expect(() => {
      dot([1, 2], x); // 2 coeffs vs 3 vars
    }).toThrow(/Array length mismatch/);

    const xDict = m.continuous(["apple", "banana"]);
    expect(() => {
      dot({ apple: 1, orange: 2 }, xDict);
    }).toThrow(/Key mismatch/);

    // 2D nested mismatch
    const x2D = m.continuous(["R1"], ["C1", "C2"]);
    expect(() => {
      dot({ R1: { C1: 1 } }, x2D);
    }).toThrow(/Key mismatch/);
  });

  it("computes dot() between 2D coefficient Arrays and numeric grid Records in both operand orders", () => {
    const m = new Model();
    const x = m.continuous(2, 2); // Record<number, Record<number, Var>>
    const coeffs = [
      [1, 2],
      [3, 4],
    ];

    // Array x Record
    const expr1 = dot(coeffs, x);
    expect(expr1.terms.get(x[0][0])).toBe(1);
    expect(expr1.terms.get(x[0][1])).toBe(2);
    expect(expr1.terms.get(x[1][0])).toBe(3);
    expect(expr1.terms.get(x[1][1])).toBe(4);

    // Record x Array
    const expr2 = dot(x, coeffs);
    expect(expr2.terms.get(x[0][0])).toBe(1);
    expect(expr2.terms.get(x[0][1])).toBe(2);
    expect(expr2.terms.get(x[1][0])).toBe(3);
    expect(expr2.terms.get(x[1][1])).toBe(4);

    // Shape mismatch throws
    expect(() => {
      dot([[1, 2]], x); // 1 row vs 2 rows
    }).toThrow(/Array length mismatch/);

    expect(() => {
      dot([[1, 2, 3], [4, 5, 6]], x); // 3 cols vs 2 cols
    }).toThrow(/Array length mismatch/);
  });

  it("handles 1D and 2D variable dictionaries with arbitrary keys like 'id', 'terms', 'quadTerms'", async () => {
    const m = new Model();

    // 1D dictionary with keys 'id', 'terms', 'quadTerms'
    const x1 = m.binary(["id", "terms", "quadTerms"]);
    const coeffs1 = { id: 10, terms: 20, quadTerms: 30 };

    const e1 = dot(coeffs1, x1);
    expect(e1.terms.get(x1.id)).toBe(10);
    expect(e1.terms.get(x1.terms)).toBe(20);
    expect(e1.terms.get(x1.quadTerms)).toBe(30);

    const e1Rev = dot(x1, coeffs1);
    expect(e1Rev.terms.get(x1.id)).toBe(10);
    expect(e1Rev.terms.get(x1.terms)).toBe(20);
    expect(e1Rev.terms.get(x1.quadTerms)).toBe(30);

    // 2D nested dictionary with keys 'id', 'terms'
    const x2 = m.continuous(["id", "terms"], ["id", "quadTerms"]);
    const coeffs2 = {
      id: { id: 1, quadTerms: 2 },
      terms: { id: 3, quadTerms: 4 },
    };

    const e2 = dot(coeffs2, x2);
    expect(e2.terms.get(x2.id.id)).toBe(1);
    expect(e2.terms.get(x2.id.quadTerms)).toBe(2);
    expect(e2.terms.get(x2.terms.id)).toBe(3);
    expect(e2.terms.get(x2.terms.quadTerms)).toBe(4);

    const e2Rev = dot(x2, coeffs2);
    expect(e2Rev.terms.get(x2.id.id)).toBe(1);
    expect(e2Rev.terms.get(x2.id.quadTerms)).toBe(2);
    expect(e2Rev.terms.get(x2.terms.id)).toBe(3);
    expect(e2Rev.terms.get(x2.terms.quadTerms)).toBe(4);
  });

  describe("m.bool factory (propositional boolean variables)", () => {
    it("creates single BoolVar", () => {
      const m = new Model();
      const p = m.bool("p");
      expect(p.name).toBe("p");
      expect(p.value).toBe(null);
      expect(m.boolVars).toContain(p);
    });

    it("creates BoolVar[] by count", () => {
      const m = new Model();
      const flags = m.bool(3);
      expect(flags.length).toBe(3);
      expect(flags[0].name).toBe("p_0");
      expect(flags[1].name).toBe("p_1");
      expect(flags[2].name).toBe("p_2");
    });

    it("creates Record<string, BoolVar> by keys", () => {
      const m = new Model();
      const perms = m.bool(["read", "write", "execute"]);
      expect(Object.keys(perms)).toEqual(["read", "write", "execute"]);
      expect(perms.read.name).toBe("read");
      expect(perms.write.name).toBe("write");
      expect(perms.execute.name).toBe("execute");
    });

    it("creates 2D Record<R, Record<C, BoolVar>> by rows and cols", () => {
      const m = new Model();
      const grid = m.bool(["alice", "bob"], ["admin", "viewer"]);
      expect(grid.alice.admin.name).toBe("p_alice_admin");
      expect(grid.alice.viewer.name).toBe("p_alice_viewer");
      expect(grid.bob.admin.name).toBe("p_bob_admin");
      expect(grid.bob.viewer.name).toBe("p_bob_viewer");
    });

    it("extracts boolean solution values via m.getValues()", async () => {
      const { registerZ3Solver, killZ3Threads } = await import("../src/modeler/solvers/z3.js");
      registerZ3Solver();

      const m = new Model({ solver: "z3" });
      const single = m.bool("single");
      const list = m.bool(2);
      const dict = m.bool(["optA", "optB"]);
      const grid = m.bool(["r1", "r2"], ["c1", "c2"]);

      // single must be true
      m.constrain(single);
      // list[0] is true, list[1] is false
      m.constrain(list[0]);
      m.constrain(list[1].not());
      // dict.optA is true, dict.optB is false
      m.constrain(dict.optA);
      m.constrain(dict.optB.not());
      // grid: r1.c1 true, others false
      m.constrain(grid.r1.c1);
      m.constrain(grid.r1.c2.not());
      m.constrain(grid.r2.c1.not());
      m.constrain(grid.r2.c2.not());

      const res = await m.check();
      expect(res.status).toBe("Sat");

      // Verify m.getValues
      expect(m.getValues(single)).toBe(true);
      expect(m.getValues(list)).toEqual([true, false]);
      expect(m.getValues(dict)).toEqual({ optA: true, optB: false });
      expect(m.getValues(grid)).toEqual({
        r1: { c1: true, c2: false },
        r2: { c1: false, c2: false },
      });

      await killZ3Threads();
    });

    it("generates unique variable names across multiple m.bool(count) calls without collisions (Sat)", async () => {
      const { registerZ3Solver, killZ3Threads } = await import("../src/modeler/solvers/z3.js");
      registerZ3Solver();

      const m = new Model({ solver: "z3" });
      const [a] = m.bool(1);
      const [b] = m.bool(1);
      expect(a.name).not.toBe(b.name);

      m.constrain(a);
      m.constrain(b.not());
      const res = await m.check();
      expect(res.status).toBe("Sat");

      await killZ3Threads();
    });

    it("generates unique variable names between m.bool() and m.bool(count)", () => {
      const m = new Model();
      const a = m.bool();
      const [b, c] = m.bool(2);
      expect(new Set([a.name, b.name, c.name]).size).toBe(3);
    });

    it("throws error when duplicate boolean variable name is explicitly specified", () => {
      const m = new Model();
      m.bool("flag");
      expect(() => m.bool("flag")).toThrow(/Variable with name 'flag' already exists in model/);
    });

    it("throws error when boolean variable conflicts with numeric variable", () => {
      const m = new Model();
      m.continuous("x");
      expect(() => m.bool("x")).toThrow(/Variable with name 'x' already exists in model/);

      m.bool("b_var");
      expect(() => m.integer("b_var")).toThrow(/Variable with name 'b_var' already exists in model/);
    });
  });

  describe("Var.add and Var.sub with Expr union (LinExpr | QuadExpr)", () => {
    it("accepts Expr union without TS2769 and evaluates correctly", () => {
      const m = new Model();
      const x = m.continuous("x");
      const y = m.continuous("y");

      function combine(e: LinExpr | QuadExpr) {
        return {
          added: x.add(e),
          subbed: x.sub(e),
        };
      }

      const lin: LinExpr = y.mul(2);
      const resLin = combine(lin);
      expect(resLin.added).toBeInstanceOf(LinExpr);
      expect(resLin.subbed).toBeInstanceOf(LinExpr);

      const quad: QuadExpr = x.mul(y);
      const resQuad = combine(quad);
      expect(resQuad.added).toBeInstanceOf(QuadExpr);
      expect(resQuad.subbed).toBeInstanceOf(QuadExpr);
    });
  });

  describe("Diet Sensitivity Preset constraints verification", () => {
    it("verifies constraint references retain names, shadow prices (duals) and slacks", async () => {
      const m = new Model();
      const foods = [
        { name: "Oats",    cost: 0.60, calories: 150, protein: 5,  calcium: 20,  iron: 1.8 },
        { name: "Chicken", cost: 2.40, calories: 220, protein: 32, calcium: 15,  iron: 1.2 },
        { name: "Eggs",    cost: 0.80, calories: 140, protein: 12, calcium: 50,  iron: 1.7 },
        { name: "Milk",    cost: 0.90, calories: 120, protein: 8,  calcium: 280, iron: 0.1 },
        { name: "Spinach", cost: 1.50, calories: 40,  protein: 4,  calcium: 120, iron: 3.5 },
        { name: "Salmon",  cost: 3.60, calories: 200, protein: 25, calcium: 20,  iron: 0.8 },
      ];

      const srv = m.continuous(foods.map((f) => f.name), { lb: 0, ub: 4, prefix: "srv" });
      m.minimize(sum(foods, (f) => srv[f.name].mul(f.cost)));

      const cCal  = sum(foods, (f) => srv[f.name].mul(f.calories)).ge(2000, "min_calories");
      const cProt = sum(foods, (f) => srv[f.name].mul(f.protein)).ge(105,   "min_protein");
      const cCalc = sum(foods, (f) => srv[f.name].mul(f.calcium)).ge(1000,  "min_calcium");
      const cIron = sum(foods, (f) => srv[f.name].mul(f.iron)).ge(18,       "min_iron");
      m.constrain([cCal, cProt, cCalc, cIron]);

      const status = await m.solve();
      expect(status).toBe("Optimal");

      expect(cCal.name).toBe("min_calories");
      expect(cProt.name).toBe("min_protein");
      expect(cCalc.name).toBe("min_calcium");
      expect(cIron.name).toBe("min_iron");

      // Verify duals (shadow prices)
      expect(cCal.dual).toBeCloseTo(0.0091, 3);
      expect(cIron.dual).toBeCloseTo(0.3241, 3);

      // Verify slacks
      expect(Math.abs(cProt.slack || 0)).toBeCloseTo(46.5, 1);
      expect(Math.abs(cCalc.slack || 0)).toBeCloseTo(483.0, 1);
    });
  });

  it("models semi-continuous decisions using continuous and binary variables with linking constraints", async () => {
    // Semi-continuous: batch in {0} U [10, 100]
    // 1. When minimizing batch without demand: optimal is batch = 0, isActive = 0
    const m1 = new Model();
    const batch1 = m1.continuous("batch", { lb: 0, ub: 100 });
    const isActive1 = m1.binary("is_active");
    m1.constrain(expr`${batch1} >= 10 * ${isActive1}`, "min_batch_run");
    m1.constrain(expr`${batch1} <= 100 * ${isActive1}`, "max_batch_run");
    m1.minimize(batch1);

    const status1 = await m1.optimize();
    expect(status1).toBe("Optimal");
    expect(batch1.value).toBe(0);
    expect(isActive1.value).toBe(0);

    // 2. When batch has positive demand >= 1: optimal is batch = 10, isActive = 1
    const m2 = new Model();
    const batch2 = m2.continuous("batch", { lb: 0, ub: 100 });
    const isActive2 = m2.binary("is_active");
    m2.constrain(expr`${batch2} >= 10 * ${isActive2}`, "min_batch_run");
    m2.constrain(expr`${batch2} <= 100 * ${isActive2}`, "max_batch_run");
    m2.constrain(expr`${batch2} >= 1`, "demand");
    m2.minimize(batch2);

    const status2 = await m2.optimize();
    expect(status2).toBe("Optimal");
    expect(batch2.value).toBe(10);
    expect(isActive2.value).toBe(1);

    // 3. When demand requires 0 < batch < 10 (e.g. batch in [1, 5]): infeasible
    const m3 = new Model();
    const batch3 = m3.continuous("batch", { lb: 0, ub: 100 });
    const isActive3 = m3.binary("is_active");
    m3.constrain(expr`${batch3} >= 10 * ${isActive3}`, "min_batch_run");
    m3.constrain(expr`${batch3} <= 100 * ${isActive3}`, "max_batch_run");
    m3.constrain(expr`${batch3} >= 1`, "min_demand");
    m3.constrain(expr`${batch3} <= 5`, "max_demand");

    const status3 = await m3.optimize();
    expect(status3).toBe("Infeasible");
  });
});

