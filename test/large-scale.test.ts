import { describe, it, expect } from "vitest";
import { Model, sum, minimize } from "../src/modeler/index.js";

describe("Large-Scale Optimization Benchmark (20,000+ Variables)", () => {
  it("solves a realistic 20,050-variable supply chain facility location & distribution problem", async () => {
    const t0 = performance.now();

    // 1. Problem Dimensions
    const numWarehouses = 50;  // Potential distribution centers
    const numCustomers = 400;  // Retail demand points
    // Total route variables x[w][c] = 50 * 400 = 20,000
    // Plus 50 binary warehouse selection variables y[w]
    // Total variables = 20,050

    const m = new Model({ name: "SupplyChainLargeScale", sense: "Minimize" });

    // Seeded deterministic pseudo-random generator
    let seed = 42;
    function rand() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    // Customer demands (average 50 units each, total demand ~20,000)
    const demands: number[] = [];
    let totalDemand = 0;
    for (let c = 0; c < numCustomers; c++) {
      const d = Math.floor(30 + rand() * 40); // 30 ~ 70
      demands.push(d);
      totalDemand += d;
    }

    // Warehouse capacities and fixed opening costs
    const capacities: number[] = [];
    const fixedCosts: number[] = [];
    for (let w = 0; w < numWarehouses; w++) {
      capacities.push(Math.floor(800 + rand() * 800)); // 800 ~ 1600
      fixedCosts.push(Math.floor(5000 + rand() * 5000)); // 5,000 ~ 10,000
    }

    // Unit transportation cost c[w][c] based on simulated Euclidean distances
    const transCosts: number[][] = [];
    for (let w = 0; w < numWarehouses; w++) {
      const row: number[] = [];
      const wx = rand() * 100;
      const wy = rand() * 100;
      for (let c = 0; c < numCustomers; c++) {
        const cx = rand() * 100;
        const cy = rand() * 100;
        const dist = Math.hypot(wx - cx, wy - cy);
        const unitCost = Math.round((2.0 + dist * 0.15) * 10) / 10;
        row.push(unitCost);
      }
      transCosts.push(row);
    }

    // 2. Decision Variables
    // y[w]: binary variable = 1 if warehouse w is opened, 0 otherwise
    const y = m.binary(numWarehouses, { prefix: "y" });

    // x[w][c]: continuous variable = quantity shipped from warehouse w to customer c
    const x = m.continuous(numWarehouses, numCustomers, { lb: 0, prefix: "x" });
    const objTerms: Array<{ v: any; c: number }> = [];

    // Fixed cost terms in objective
    for (let w = 0; w < numWarehouses; w++) {
      objTerms.push({ v: y[w], c: fixedCosts[w] });
    }

    for (let w = 0; w < numWarehouses; w++) {
      for (let c = 0; c < numCustomers; c++) {
        objTerms.push({ v: x[w][c], c: transCosts[w][c] });
      }
    }

    expect(m.variables.length).toBe(20050);

    // Set Objective: Minimize total cost using fast O(N) sum
    m.objective(minimize(sum(objTerms, (t) => t.v.mul(t.c))));

    // 3. Constraints
    // 3.1. Demand satisfaction: sum_{w} x[w][c] >= demands[c] (400 constraints)
    for (let c = 0; c < numCustomers; c++) {
      const suppliers = [];
      for (let w = 0; w < numWarehouses; w++) {
        suppliers.push(x[w][c]);
      }
      m.constraint(sum(suppliers).ge(demands[c]), `demand_${c}`);
    }

    // 3.2. Capacity & opening linking: sum_{c} x[w][c] <= capacities[w] * y[w]
    // which is: sum_{c} x[w][c] - capacities[w] * y[w] <= 0 (50 constraints)
    for (let w = 0; w < numWarehouses; w++) {
      const shipments = [];
      for (let c = 0; c < numCustomers; c++) {
        shipments.push(x[w][c]);
      }
      m.constraint(
        sum(shipments).sub(y[w].mul(capacities[w])).le(0),
        `cap_${w}`
      );
    }

    // 3.3. Maximum warehouse budget: sum_{w} y[w] <= 25 (at most 25 warehouses open)
    m.constraint(sum(y).le(25), "max_warehouses");

    const tBuilt = performance.now();
    console.log(`[LargeScale] Model built in ${(tBuilt - t0).toFixed(1)} ms. Total vars: ${m.variables.length}, constraints: ${m.constraints.length}`);

    // 4. Solve with HiGHS WASM
    const status = await m.solve();
    const tSolved = performance.now();

    console.log(`[LargeScale] Solved in ${(tSolved - tBuilt).toFixed(1)} ms. Status: ${status}, Objective: ${m.objectiveValue?.toFixed(2)}`);

    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBeGreaterThan(0);

    // Count how many warehouses were selected to open
    const openWarehouses = y.filter((yw) => Math.round(yw.value ?? 0) === 1);
    console.log(`[LargeScale] Opened warehouses: ${openWarehouses.length} / ${numWarehouses}`);
    expect(openWarehouses.length).toBeGreaterThan(0);
    expect(openWarehouses.length).toBeLessThanOrEqual(25);

    // Verify all demands are satisfied
    for (let c = 0; c < numCustomers; c++) {
      let fulfilled = 0;
      for (let w = 0; w < numWarehouses; w++) {
        fulfilled += x[w][c].value ?? 0;
      }
      expect(fulfilled).toBeGreaterThanOrEqual(demands[c] - 1e-4);
    }
  }, 60000);
});
