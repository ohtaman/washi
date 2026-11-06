/**
 * Example 13: Capacitated Vehicle Routing Problem (CVRP) via Column Generation
 *
 * Demonstrates:
 * - Dantzig-Wolfe Decomposition / Column Generation for combinatorial OR problems
 * - Master problem: Set covering / fleet vehicle minimization
 * - Pricing subproblem: Knapsack-based route generation using master shadow prices
 * - Returning subproblem model with `sub.linkColumn({ cost, coefficients })`
 *
 * Run with: npx tsx examples/node/13-vehicle-routing-column-generation.ts
 */

import { Model, expr, minimize, LinExpr, type Var } from "../../src/index.js";

export async function runCVRP() {
  console.log("=== Capacitated Vehicle Routing Problem (CVRP) via Column Generation ===");

  // Problem parameters: 5 customers with demands and maximum vehicle capacity of 8 units
  const vehicleCapacity = 8;
  const customers = [
    { id: "C1", demand: 4 },
    { id: "C2", demand: 3 },
    { id: "C3", demand: 5 },
    { id: "C4", demand: 2 },
    { id: "C5", demand: 4 },
  ];
  // Total demand: 4 + 3 + 5 + 2 + 4 = 18 units.
  // Theoretical minimum fleet: ceil(18 / 8) = 3 vehicles.

  // 1. Build Master Problem (Restricted Master Problem - RMP)
  const master = new Model("CVRP_FleetMaster");

  // Initial naive routes: 1 dedicated vehicle per customer
  const initialRoutes: Var[] = [];
  for (const cust of customers) {
    const r = master.integer(`route_init_${cust.id}`, { lb: 0, ub: 1 });
    initialRoutes.push(r);
  }

  // Objective: Minimize total fleet size
  master.objective(
    minimize(initialRoutes.reduce((acc, r) => acc.add(r), new LinExpr()))
  );

  // Customer coverage constraints: Each customer must be visited by at least 1 vehicle route
  for (let i = 0; i < customers.length; i++) {
    master.constraint(
      expr`${initialRoutes[i]} >= 1`,
      `visit_${customers[i].id}`
    );
  }

  console.log("Initial state: 5 naive single-customer routes (5 vehicles).");
  console.log("Iteratively solving Column Generation (Dantzig-Wolfe decomposition)...");

  // 2. Solve via Column Generation
  const result = await master.solveColumnGeneration({
    finalizeAsMIP: true,
    subproblem: (context) => {
      // Pricing subproblem: Given dual prices of master visit constraints,
      // find a new feasible vehicle route visiting a subset of customers that satisfies vehicle capacity
      const sub = new Model(`RoutePricing_Iter${context.iteration}`);

      const visitVars: Record<string, Var> = {};
      for (const cust of customers) {
        visitVars[cust.id] = sub.binary(`v_${cust.id}`);
      }

      // Knapsack capacity constraint: sum(demand_i * v_i) <= vehicleCapacity
      const loadExpr = customers.reduce(
        (acc, cust) => acc.add(visitVars[cust.id].mul(cust.demand)),
        new LinExpr()
      );
      sub.constraint(expr`${loadExpr} <= ${vehicleCapacity}`);

      // Link proposed column to master customer coverage constraints
      const coefficients: Record<string, Var> = {};
      for (const cust of customers) {
        coefficients[`visit_${cust.id}`] = visitVars[cust.id];
      }

      sub.linkColumn({
        cost: 1, // 1 vehicle per route
        type: "Integer",
        lb: 0,
        ub: 1,
        coefficients,
      });

      return sub;
    },
    onIteration: (info) => {
      console.log(
        `  Iter ${info.iteration}: LP relaxation obj = ${info.relaxationObjective?.toFixed(3)}, columns added = ${info.columnsAdded}`
      );
    },
  });

  console.log(`\nStatus: ${result.status}`);
  console.log(`Optimal Vehicles: ${result.objectiveValue} (Continuous relaxation bound: ${result.relaxationObjectiveValue?.toFixed(3)})`);
  console.log(`Total Columns Generated: ${result.columnsAdded}`);
  console.log(`Total Iterations: ${result.iterations}`);

  console.log("\nActive routes in optimal fleet:");
  for (const [varName, val] of Object.entries(result.values)) {
    if (val > 0.5) {
      console.log(`  ${varName} = ${val}`);
    }
  }
  return result;
}

if (process.argv[1]?.includes("13-vehicle-routing-column-generation")) {
  runCVRP().catch(console.error);
}
