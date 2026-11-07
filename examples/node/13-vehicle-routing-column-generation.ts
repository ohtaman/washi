/**
 * Example 13: Capacitated Vehicle Routing Problem (CVRP) via Column Generation
 *
 * Demonstrates:
 * - Dantzig-Wolfe Decomposition / Column Generation for combinatorial OR problems
 * - Master problem: Set covering / fleet vehicle minimization
 * - Pricing subproblem: Knapsack-based route generation using master shadow prices
 * - Pricing callback receiving dual values and returning feasible route columns
 *
 * Run with: npx tsx examples/node/13-vehicle-routing-column-generation.ts
 */

import { Model, expr, minimize, maximize, LinExpr, type Var } from "../../src/index.js";

interface RouteMeta {
  visitedCustomers: string[];
}

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
    const r = master.binary(`route_init_${cust.id}`);
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
  const result = await master.solveColumnGeneration<RouteMeta>({
    finalizeAsMIP: true,
    pricing: async ({ getDual }) => {
      // Pricing subproblem: Given dual prices of master visit constraints,
      // find a new feasible vehicle route visiting a subset of customers that satisfies vehicle capacity
      const sub = new Model("RoutePricing");

      const visitVars: Record<string, Var> = {};
      const obj = new LinExpr();

      for (const cust of customers) {
        visitVars[cust.id] = sub.binary(`v_${cust.id}`);
        const dual = getDual(`visit_${cust.id}`);
        obj.addTerm(visitVars[cust.id], dual);
      }

      // Maximize collected dual revenue
      sub.objective(maximize(obj));

      // Knapsack capacity constraint: sum(demand_i * v_i) <= vehicleCapacity
      const loadExpr = customers.reduce(
        (acc, cust) => acc.add(visitVars[cust.id].mul(cust.demand)),
        new LinExpr()
      );
      sub.constraint(expr`${loadExpr} <= ${vehicleCapacity}`);

      await sub.solve();

      const coefficients: Record<string, number> = {};
      const visited: string[] = [];
      for (const cust of customers) {
        const isVisited = Math.round(visitVars[cust.id].value ?? 0) === 1;
        if (isVisited) {
          coefficients[`visit_${cust.id}`] = 1;
          visited.push(cust.id);
        }
      }

      return {
        cost: 1, // 1 vehicle per route
        type: "Binary",
        coefficients,
        meta: { visitedCustomers: visited },
      };
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

  console.log("\nGenerated routes selected in optimal fleet:");
  for (const col of result.generatedColumns) {
    if ((col.variable.value ?? 0) > 0.5) {
      console.log(`  ${col.variable.name} (visits: [${col.proposal.meta?.visitedCustomers.join(", ")}]) = ${col.variable.value}`);
    }
  }
  return result;
}

if (process.argv[1]?.includes("13-vehicle-routing-column-generation")) {
  runCVRP().catch(console.error);
}
