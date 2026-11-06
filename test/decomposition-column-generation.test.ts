import { describe, it, expect } from "vitest";
import { Model, expr, minimize, maximize, solveColumnGeneration } from "../src/index.js";

describe("Column Generation (Dantzig-Wolfe Decomposition)", () => {
  it("solves the classical Cutting Stock Problem (CSP) via dynamic pattern pricing", async () => {
    // Problem parameters:
    // Standard stock roll width = 100
    // Item demands:
    // - Item A: width 45, demand 10
    // - Item B: width 36, demand 14
    // - Item C: width 16, demand 20
    const rollWidth = 100;
    const items = [
      { id: "A", width: 45, demand: 10 },
      { id: "B", width: 36, demand: 14 },
      { id: "C", width: 16, demand: 20 },
    ];

    // Master Problem (Restricted Master Problem, RMP):
    // Minimize total stock rolls used subject to fulfilling demand for each item.
    const master = new Model("CuttingStockMaster");
    master.objective(minimize(0));

    // Create demand constraints
    for (const item of items) {
      master.constraint(expr`0 >= ${item.demand}`, `demand_${item.id}`);
    }

    // Add naive initial single-item patterns:
    // Pattern A: 2 of A (45*2 = 90 <= 100)
    master.addColumn({
      name: "init_pattern_A",
      type: "Integer",
      cost: 1,
      coefficients: { demand_A: 2 },
    });

    // Pattern B: 2 of B (36*2 = 72 <= 100)
    master.addColumn({
      name: "init_pattern_B",
      type: "Integer",
      cost: 1,
      coefficients: { demand_B: 2 },
    });

    // Pattern C: 6 of C (16*6 = 96 <= 100)
    master.addColumn({
      name: "init_pattern_C",
      type: "Integer",
      cost: 1,
      coefficients: { demand_C: 6 },
    });

    // Solve via Column Generation
    let patternCounter = 0;
    const result = await solveColumnGeneration({
      master,
      maxIterations: 50,
      reducedCostTolerance: 1e-5,
      finalizeAsMIP: true,
      pricing: async ({ getDual }) => {
        // Pricing Subproblem: Bounded Knapsack Problem
        // Maximize sum(pi_i * a_i) subject to sum(width_i * a_i) <= rollWidth
        const sub = new Model("KnapsackPricing");
        const a_A = sub.integer("a_A", { lb: 0, ub: Math.floor(rollWidth / 45) });
        const a_B = sub.integer("a_B", { lb: 0, ub: Math.floor(rollWidth / 36) });
        const a_C = sub.integer("a_C", { lb: 0, ub: Math.floor(rollWidth / 16) });

        const dualA = getDual("demand_A");
        const dualB = getDual("demand_B");
        const dualC = getDual("demand_C");

        sub.objective(maximize(expr`${dualA} * ${a_A} + ${dualB} * ${a_B} + ${dualC} * ${a_C}`));
        sub.constraint(expr`45 * ${a_A} + 36 * ${a_B} + 16 * ${a_C} <= ${rollWidth}`, "knapsack");

        const subStatus = await sub.solve();
        if (subStatus !== "Optimal") return null;

        const maxDualValue = sub.objectiveValue ?? 0;
        const reducedCost = 1 - maxDualValue;

        // If reduced cost is negative, the pattern improves the master objective
        if (reducedCost < -1e-5) {
          patternCounter++;
          const valA = Math.round(a_A.value ?? 0);
          const valB = Math.round(a_B.value ?? 0);
          const valC = Math.round(a_C.value ?? 0);

          return {
            name: `gen_pattern_${patternCounter}`,
            type: "Integer",
            cost: 1,
            coefficients: {
              demand_A: valA,
              demand_B: valB,
              demand_C: valC,
            },
            reducedCost,
            meta: { pattern: [valA, valB, valC] },
          };
        }

        return null; // Optimal LP relaxation reached
      },
    });

    expect(result.status).toBe("Optimal");
    expect(result.iterations).toBeGreaterThan(1);
    expect(result.columnsAdded).toBeGreaterThan(0);
    expect(result.relaxationObjectiveValue).toBeGreaterThan(0);
    expect(result.objectiveValue).toBeGreaterThanOrEqual(result.relaxationObjectiveValue!);

    // Total required item width: 45*10 + 36*14 + 16*20 = 450 + 504 + 320 = 1274
    // Theoretical lower bound with 100-width rolls is ceil(1274 / 100) = 13 rolls.
    // The exact integer optimum for this classic instance is 14 rolls.
    expect(result.objectiveValue).toBeCloseTo(14, 1e-4);

    // Verify all demands are fully fulfilled
    const sol = result.values;
    let fulfilledA = 0;
    let fulfilledB = 0;
    let fulfilledC = 0;

    for (const { variable, proposal } of result.generatedColumns) {
      const count = sol[variable.name] ?? 0;
      const coeffs = proposal.coefficients as Record<string, number>;
      fulfilledA += count * (coeffs.demand_A ?? 0);
      fulfilledB += count * (coeffs.demand_B ?? 0);
      fulfilledC += count * (coeffs.demand_C ?? 0);
    }
    // Include initial patterns
    fulfilledA += 2 * (sol["init_pattern_A"] ?? 0);
    fulfilledB += 2 * (sol["init_pattern_B"] ?? 0);
    fulfilledC += 6 * (sol["init_pattern_C"] ?? 0);

    expect(fulfilledA).toBeGreaterThanOrEqual(10 - 1e-5);
    expect(fulfilledB).toBeGreaterThanOrEqual(14 - 1e-5);
    expect(fulfilledC).toBeGreaterThanOrEqual(20 - 1e-5);
  });

  it("terminates immediately when pricing callback returns null and respects finalizeAsMIP: false", async () => {
    const master = new Model("ImmediateTermMaster");
    const x = master.continuous("x", { lb: 0 });
    master.objective(minimize(x));
    master.constraint(expr`${x} >= 5`, "min_x");

    let iterationsCount = 0;
    const progressLog: number[] = [];

    const result = await solveColumnGeneration({
      master,
      finalizeAsMIP: false,
      onIteration: (info) => {
        progressLog.push(info.iteration);
      },
      pricing: ({ iteration }) => {
        iterationsCount = iteration;
        return null; // No new columns
      },
    });

    expect(result.status).toBe("Optimal");
    expect(result.iterations).toBe(1);
    expect(result.columnsAdded).toBe(0);
    expect(result.objectiveValue).toBe(5);
    expect(result.relaxationObjectiveValue).toBe(5);
    expect(iterationsCount).toBe(1);
    expect(progressLog).toEqual([1]);
  });

  it("solves Cutting Stock Problem using master.solveColumnGeneration with natural initial variables", async () => {
    const rollWidth = 100;
    const items = [
      { id: "A", width: 45, demand: 10 },
      { id: "B", width: 36, demand: 14 },
      { id: "C", width: 16, demand: 20 },
    ];

    const master = new Model("SimpleCuttingStockMaster");

    // Initial naive single-cut patterns using natural master variables
    const initA = master.integer("init_A", { lb: 0 });
    const initB = master.integer("init_B", { lb: 0 });
    const initC = master.integer("init_C", { lb: 0 });

    master.objective(minimize(expr`${initA} + ${initB} + ${initC}`));
    master.constraint(expr`2 * ${initA} >= ${items[0].demand}`, `demand_${items[0].id}`);
    master.constraint(expr`2 * ${initB} >= ${items[1].demand}`, `demand_${items[1].id}`);
    master.constraint(expr`6 * ${initC} >= ${items[2].demand}`, `demand_${items[2].id}`);

    // Subproblem knapsack model
    const sub = new Model("KnapsackSub");
    const a_A = sub.integer("a_A", { lb: 0, ub: 2 });
    const a_B = sub.integer("a_B", { lb: 0, ub: 2 });
    const a_C = sub.integer("a_C", { lb: 0, ub: 6 });
    sub.constraint(expr`45 * ${a_A} + 36 * ${a_B} + 16 * ${a_C} <= ${rollWidth}`);

    const result = await master.solveColumnGeneration({
      finalizeAsMIP: true,
      pricing: async ({ getDual }) => {
        const dualA = getDual("demand_A");
        const dualB = getDual("demand_B");
        const dualC = getDual("demand_C");

        sub.objective(maximize(expr`${dualA} * ${a_A} + ${dualB} * ${a_B} + ${dualC} * ${a_C}`));
        const status = await sub.solve();
        if (status !== "Optimal") return null;

        return {
          cost: 1,
          type: "Integer",
          coefficients: {
            demand_A: Math.round(a_A.value ?? 0),
            demand_B: Math.round(a_B.value ?? 0),
            demand_C: Math.round(a_C.value ?? 0),
          },
        };
      },
    });

    expect(result.status).toBe("Optimal");
    expect(result.objectiveValue).toBe(14);
    expect(result.columnsAdded).toBeGreaterThanOrEqual(1);
    expect(master.decomposition).toBe(result);
  });

  it("preserves positive reduced cost for master maximization with custom pricing", async () => {
    // Maximize master objective: max x with initial column x <= 1 (cost 1)
    const master = new Model("MaxMaster");
    master.constraint(expr`0 <= 1`, "cap");
    // Initial column with cost 1, coeff 1
    const initCol = master.addColumn({ cost: 1, type: "Continuous", coefficients: { cap: 1 } });
    master.objective(maximize(initCol));

    // Pricing subproblem provides an improving column with cost 2 and coeff 1
    const result = await master.solveColumnGeneration({
      finalizeAsMIP: true,
      pricing: async ({ getDual }) => {
        const dual = getDual("cap");
        return {
          cost: 2,
          type: "Continuous",
          coefficients: { cap: 1 },
          reducedCost: 2 - dual,
        };
      },
    });

    expect(result.status).toBe("Optimal");
    expect(result.objectiveValue).toBe(2);
    expect(result.columnsAdded).toBe(1);
  });

  it("supports pricing callback using constraint duals and returning column proposals with Constraint references", async () => {
    const rollWidth = 100;
    const items = [
      { id: "A", width: 45, demand: 10 },
      { id: "B", width: 36, demand: 14 },
      { id: "C", width: 16, demand: 20 },
    ];

    const master = new Model("ConstraintRefCuttingStock");
    master.objective(minimize(0));

    for (const item of items) {
      master.constraint(expr`0 >= ${item.demand}`, `demand_${item.id}`);
    }

    const cA = master.getConstraintByName("demand_A")!;
    const cB = master.getConstraintByName("demand_B")!;
    const cC = master.getConstraintByName("demand_C")!;

    // Initial naive columns
    master.addColumn({ cost: 1, type: "Integer", coefficients: { demand_A: 2 } });
    master.addColumn({ cost: 1, type: "Integer", coefficients: { demand_B: 2 } });
    master.addColumn({ cost: 1, type: "Integer", coefficients: { demand_C: 6 } });

    // Solve using pricing callback referencing constraints directly
    const result = await master.solveColumnGeneration({
      finalizeAsMIP: true,
      pricing: async ({ getDual }) => {
        const sub = new Model("KnapsackSubDirect");
        const a_A = sub.integer("a_A", { lb: 0, ub: 2 });
        const a_B = sub.integer("a_B", { lb: 0, ub: 2 });
        const a_C = sub.integer("a_C", { lb: 0, ub: 6 });

        const dualA = getDual(cA);
        const dualB = getDual(cB);
        const dualC = getDual(cC);

        sub.objective(maximize(expr`${dualA} * ${a_A} + ${dualB} * ${a_B} + ${dualC} * ${a_C}`));
        sub.constraint(expr`45 * ${a_A} + 36 * ${a_B} + 16 * ${a_C} <= ${rollWidth}`);

        await sub.solve();

        return {
          cost: 1,
          type: "Integer",
          coefficients: [
            [cA, Math.round(a_A.value ?? 0)],
            [cB, Math.round(a_B.value ?? 0)],
            [cC, Math.round(a_C.value ?? 0)],
          ],
        };
      },
    });

    expect(result.status).toBe("Optimal");
    expect(result.objectiveValue).toBe(14);
    expect(result.columnsAdded).toBeGreaterThanOrEqual(1);
  });

  it("throws a descriptive error when pricing callback is omitted", async () => {
    const master = new Model("MissingPricingMaster");
    master.constraint(expr`0 >= 5`, "demand");
    master.addColumn({ cost: 1, type: "Integer", coefficients: { demand: 1 } });

    await expect(
      master.solveColumnGeneration({} as any)
    ).rejects.toThrow("The 'pricing' callback must be provided in ColumnGenerationOptions");
  });
});
