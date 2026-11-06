import { describe, it, expect } from "vitest";
import { Model, expr, minimize, solveBenders } from "../src/index.js";

describe("Benders Decomposition", () => {
  it("solves a Two-Stage Capacitated Facility Location Problem with optimality cuts", async () => {
    // Problem parameters:
    // 2 candidate facilities with fixed costs and capacities:
    const facilities = [
      { id: "F1", fixedCost: 100, capacity: 50 },
      { id: "F2", fixedCost: 120, capacity: 60 },
    ];
    // 3 customers with demands:
    const customers = [
      { id: "C1", demand: 30 },
      { id: "C2", demand: 25 },
      { id: "C3", demand: 20 },
    ];
    // Transportation costs c_{ij}:
    const transCost: Record<string, Record<string, number>> = {
      F1: { C1: 2, C2: 5, C3: 3 },
      F2: { C1: 4, C2: 2, C3: 4 },
    };

    // 1. Solve via Monolithic Full Model to get the exact independent reference value
    let referenceObjective: number;
    {
      const mono = new Model("MonolithicFacilityLocation");
      const y = {
        F1: mono.binary("y_F1"),
        F2: mono.binary("y_F2"),
      };
      const x: Record<string, Record<string, any>> = {
        F1: {
          C1: mono.continuous("x_F1_C1", { lb: 0 }),
          C2: mono.continuous("x_F1_C2", { lb: 0 }),
          C3: mono.continuous("x_F1_C3", { lb: 0 }),
        },
        F2: {
          C1: mono.continuous("x_F2_C1", { lb: 0 }),
          C2: mono.continuous("x_F2_C2", { lb: 0 }),
          C3: mono.continuous("x_F2_C3", { lb: 0 }),
        },
      };

      // Total cost: fixed + transport
      let objExpr = expr`100 * ${y.F1} + 120 * ${y.F2}`;
      for (const f of ["F1", "F2"]) {
        for (const c of ["C1", "C2", "C3"]) {
          objExpr = objExpr.add(x[f][c].mul(transCost[f][c]));
        }
      }
      mono.objective(minimize(objExpr));

      // Customer demand fulfillment: sum_i x_ij == d_j
      for (const c of customers) {
        mono.constraint(
          expr`${x.F1[c.id]} + ${x.F2[c.id]} == ${c.demand}`,
          `demand_${c.id}`
        );
      }

      // Facility capacity: sum_j x_ij <= K_i * y_i
      for (const f of facilities) {
        mono.constraint(
          expr`${x[f.id].C1} + ${x[f.id].C2} + ${x[f.id].C3} - ${f.capacity} * ${y[f.id as "F1" | "F2"]} <= 0`,
          `cap_${f.id}`
        );
      }

      const monoStatus = await mono.solve();
      expect(monoStatus).toBe("Optimal");
      referenceObjective = mono.objectiveValue!;
      expect(referenceObjective).toBeGreaterThan(0);
    }

    // 2. Solve using Benders Decomposition
    const master = new Model("BendersMaster");
    const y_F1 = master.binary("y_F1");
    const y_F2 = master.binary("y_F2");
    // Auxiliary variable theta representing subproblem operational cost (lower bounded by 0)
    const theta = master.continuous("theta", { lb: 0 });

    // Objective: Minimize fixed investment + theta
    master.objective(minimize(expr`100 * ${y_F1} + 120 * ${y_F2} + ${theta}`));

    // Base master constraint: total capacity of open facilities must meet total customer demand (75)
    master.constraint(expr`50 * ${y_F1} + 60 * ${y_F2} >= 75`, "master_capacity");

    let cutCounter = 0;
    const result = await solveBenders({
      master,
      maxIterations: 50,
      gapTolerance: 1e-4,
      subproblem: async ({ getMasterValue }) => {
        const val_y1 = getMasterValue(y_F1);
        const val_y2 = getMasterValue(y_F2);
        const currentTheta = getMasterValue(theta);

        // Subproblem: Given fixed facility decisions, minimize transportation cost
        const sub = new Model("TransportationSubproblem");
        const x_sub: Record<string, Record<string, any>> = {
          F1: {
            C1: sub.continuous("x11", { lb: 0 }),
            C2: sub.continuous("x12", { lb: 0 }),
            C3: sub.continuous("x13", { lb: 0 }),
          },
          F2: {
            C1: sub.continuous("x21", { lb: 0 }),
            C2: sub.continuous("x22", { lb: 0 }),
            C3: sub.continuous("x23", { lb: 0 }),
          },
        };

        let transportObj = expr`0`;
        for (const f of ["F1", "F2"]) {
          for (const c of ["C1", "C2", "C3"]) {
            transportObj = transportObj.add(x_sub[f][c].mul(transCost[f][c]));
          }
        }
        sub.objective(minimize(transportObj));

        // Demand constraints
        for (const c of customers) {
          sub.constraint(
            expr`${x_sub.F1[c.id]} + ${x_sub.F2[c.id]} >= ${c.demand}`,
            `dem_${c.id}`
          );
        }

        // Capacity constraints given master decisions: sum_j x_ij <= K_i * y_i^*
        const cap1 = 50 * val_y1;
        const cap2 = 60 * val_y2;
        sub.constraint(
          expr`${x_sub.F1.C1} + ${x_sub.F1.C2} + ${x_sub.F1.C3} <= ${cap1}`,
          "sub_cap_F1"
        );
        sub.constraint(
          expr`${x_sub.F2.C1} + ${x_sub.F2.C2} + ${x_sub.F2.C3} <= ${cap2}`,
          "sub_cap_F2"
        );

        const subStatus = await sub.solve();
        if (subStatus !== "Optimal") return null;

        const subCost = sub.objectiveValue!;

        // Check if current theta underestimates subproblem cost
        if (currentTheta < subCost - 1e-4) {
          cutCounter++;
          // Extract dual values:
          // For dem_j (>=): dual >= 0
          // For sub_cap_i (<=): dual <= 0 in standard LP or dual >= 0 depending on convention
          const d_C1 = sub.solution.duals["dem_C1"] ?? 0;
          const d_C2 = sub.solution.duals["dem_C2"] ?? 0;
          const d_C3 = sub.solution.duals["dem_C3"] ?? 0;
          const d_F1 = sub.solution.duals["sub_cap_F1"] ?? 0;
          const d_F2 = sub.solution.duals["sub_cap_F2"] ?? 0;

          // By strong duality:
          // subCost = 30*d_C1 + 25*d_C2 + 20*d_C3 + (50*val_y1)*d_F1 + (60*val_y2)*d_F2
          // Optimality cut: theta >= sum(demand_j * d_j) + 50*d_F1*y_F1 + 60*d_F2*y_F2
          const demandPart = 30 * d_C1 + 25 * d_C2 + 20 * d_C3;
          const cutExpr = expr`${theta} - ${50 * d_F1} * ${y_F1} - ${60 * d_F2} * ${y_F2} >= ${demandPart}`;

          return {
            kind: "optimality" as const,
            constraint: cutExpr,
            name: `benders_cut_${cutCounter}`,
            subproblemObjective: 100 * val_y1 + 120 * val_y2 + subCost,
          };
        }

        return null; // Converged
      },
    });

    expect(result.status).toBe("Optimal");
    expect(result.objectiveValue).toBeCloseTo(referenceObjective, 1e-4);
    expect(result.cutsAdded).toBeGreaterThanOrEqual(1);

    // Both facilities must be open in the optimal solution
    expect(Math.round(result.values["y_F1"] ?? 0)).toBe(1);
    expect(Math.round(result.values["y_F2"] ?? 0)).toBe(1);
  });

  it("terminates immediately when subproblem returns null or empty cuts", async () => {
    const master = new Model("BendersImmediateConvergence");
    const x = master.continuous("x", { lb: 0 });
    master.objective(minimize(x));
    master.constraint(expr`${x} >= 10`, "base_bound");

    const iterationsLog: number[] = [];
    const result = await solveBenders({
      master,
      onIteration: (info) => {
        iterationsLog.push(info.iteration);
      },
      subproblem: () => null, // No cuts needed
    });

    expect(result.status).toBe("Optimal");
    expect(result.iterations).toBe(1);
    expect(result.cutsAdded).toBe(0);
    expect(result.objectiveValue).toBe(10);
    expect(iterationsLog).toEqual([1]);
  });

  it("returns the incumbent decisions and objective associated with the best converged bound", async () => {
    // Minimizing 9.9999 * y + theta for binary y
    // Subproblem recourse: when y=0, cost is 10; when y=1, cost is 100
    // Total cost:
    // y=0: 9.9999*0 + 10 = 10
    // y=1: 9.9999*1 + 100 = 109.9999
    // True optimal solution is y=0 with objective 10.
    const master = new Model("IncumbentTrackingTest");
    const y = master.binary("y");
    const theta = master.continuous("theta", { lb: 0 });
    master.objective(minimize(expr`9.9999 * ${y} + ${theta}`));

    const result = await solveBenders({
      master,
      gapTolerance: 1e-4,
      subproblem: ({ getMasterValue }) => {
        const valY = Math.round(getMasterValue(y));
        if (valY === 0) {
          // Subproblem cost is 10, cut: theta >= 10 - 10*y
          const cut = expr`${theta} + 10 * ${y} >= 10`;
          return {
            kind: "optimality",
            constraint: cut,
            subproblemObjective: 10,
          };
        } else {
          // When y=1, cost is 100, cut: theta >= 100*y
          const cut = expr`${theta} - 100 * ${y} >= 0`;
          return {
            kind: "optimality",
            constraint: cut,
            subproblemObjective: 109.9999,
          };
        }
      },
    });

    expect(result.status).toBe("Optimal");
    // Must return the true incumbent y=0 with objective 10, NOT the bad candidate y=1
    expect(result.objectiveValue).toBeCloseTo(10, 3);
    expect(Math.round(result.values.y)).toBe(0);

    // Verify master solution state remains internally consistent
    expect(master.validateSolution().valid).toBe(true);
    expect(master.values.get("y")).toBe(y.value);
    expect(master.solution?.values.y).toBe(y.value);
  });

  it("solves Two-Stage Capacitated Facility Location using simplified master.solveBenders with auto-cut generation and linking constraints", async () => {
    const master = new Model("SimpleBendersMaster");
    const y_F1 = master.binary("y_F1");
    const y_F2 = master.binary("y_F2");
    master.objective(minimize(expr`100 * ${y_F1} + 120 * ${y_F2}`));
    master.constraint(expr`50 * ${y_F1} + 60 * ${y_F2} >= 75`, "master_cap");

    const result = await master.solveBenders({
      subproblem: () => {
        const sub = new Model("TransportSub");
        const x11 = sub.continuous("x11", { lb: 0 });
        const x12 = sub.continuous("x12", { lb: 0 });
        const x13 = sub.continuous("x13", { lb: 0 });
        const x21 = sub.continuous("x21", { lb: 0 });
        const x22 = sub.continuous("x22", { lb: 0 });
        const x23 = sub.continuous("x23", { lb: 0 });

        sub.objective(
          minimize(
            expr`2 * ${x11} + 5 * ${x12} + 3 * ${x13} + 4 * ${x21} + 2 * ${x22} + 4 * ${x23}`
          )
        );

        // Demand constraints
        sub.constraint(expr`${x11} + ${x21} >= 30`, "dem_C1");
        sub.constraint(expr`${x12} + ${x22} >= 25`, "dem_C2");
        sub.constraint(expr`${x13} + ${x23} >= 20`, "dem_C3");

        // Linking constraints referencing master variables
        sub.link(expr`${x11} + ${x12} + ${x13} <= 50 * ${y_F1}`);
        sub.link(expr`${x21} + ${x22} + ${x23} <= 60 * ${y_F2}`);

        return sub;
      },
    });

    expect(result.status).toBe("Optimal");
    expect(result.objectiveValue).toBeCloseTo(390, 1e-4);
    expect(result.cutsAdded).toBeGreaterThanOrEqual(1);
    expect(master.decomposition).toBe(result);
    expect(Math.round(result.values.y_F1)).toBe(1);
    expect(Math.round(result.values.y_F2)).toBe(1);
  });
});
