/**
 * Example 13: Capacitated Vehicle Routing Problem (CVRP) via Column Generation
 *
 * Demonstrates:
 * - Dantzig-Wolfe Decomposition / Column Generation for combinatorial OR problems
 * - Cluster-First, Route-Second paradigm: partitioning customers into feasible vehicle clusters
 * - Master problem: Set covering / fleet vehicle minimization
 * - Pricing subproblem: Knapsack-based route generation using master shadow prices
 * - Pricing callback receiving dual values and returning feasible route columns
 *
 * Run with: npx tsx examples/node/13-vehicle-routing-column-generation.ts
 */

import { Model, expr, minimize, maximize, sum, type Var } from "../../src/index.js";

interface RouteMeta {
  visitedCustomers: string[];
}

export async function runCVRP() {
  console.log("=== Capacitated Vehicle Routing Problem (CVRP) via Column Generation ===");

  // Operational limits: capacity, max stops, and maximum route time (minutes)
  const vehicleCapacity = 8;
  const maxStops = 3;
  const maxRouteTime = 180;

  const customers = [
    { id: "C1", demand: 4, serviceTime: 30, transitTime: 20 },
    { id: "C2", demand: 3, serviceTime: 25, transitTime: 30 },
    { id: "C3", demand: 5, serviceTime: 40, transitTime: 15 },
    { id: "C4", demand: 2, serviceTime: 20, transitTime: 25 },
    { id: "C5", demand: 4, serviceTime: 35, transitTime: 20 },
  ];
  // Total demand: 4 + 3 + 5 + 2 + 4 = 18 units.
  // Theoretical minimum fleet: ceil(18 / 8) = 3 vehicles.

  // 1. Build Master Problem (Restricted Master Problem - RMP)
  const master = new Model("CVRP_FleetMaster");

  // Initial naive routes: 1 dedicated vehicle per customer
  const initialRoutes: Var[] = customers.map((c) => master.binary(`route_init_${c.id}`));

  // Objective: Minimize total fleet size
  master.objective(minimize(sum(initialRoutes)));

  // Customer coverage constraints: Each customer must be visited by at least 1 vehicle route
  for (let i = 0; i < customers.length; i++) {
    master.constraint(
      expr`${initialRoutes[i]} >= 1`,
      `visit_${customers[i].id}`
    );
  }
  const visitConstrs = master.constraints;

  console.log("Initial state: 5 naive single-customer routes (5 vehicles).");
  console.log("Iteratively solving Column Generation (Dantzig-Wolfe decomposition)...");

  // 2. Solve via Column Generation
  const result = await master.solveColumnGeneration<RouteMeta>({
    finalizeAsMIP: true,
    pricing: async () => {
      // Pricing subproblem: Find a new feasible vehicle route satisfying:
      // 1. Cargo capacity limit
      // 2. Maximum customer stops limit
      // 3. Maximum route duration limit (transit + unloading service time)
      const sub = new Model("RoutePricing");

      const visitVars: Record<string, Var> = Object.fromEntries(
        customers.map((c) => [c.id, sub.binary(`v_${c.id}`)])
      );

      // Maximize collected dual shadow prices directly from constraint .dual properties
      sub.objective(
        maximize(sum(customers, (c, i) => visitVars[c.id].mul(visitConstrs[i].dual ?? 0)))
      );

      // 1. Knapsack capacity constraint
      sub.constraint(
        expr`${sum(customers, (c) => visitVars[c.id].mul(c.demand))} <= ${vehicleCapacity}`
      );

      // 2. Maximum stops constraint
      sub.constraint(
        expr`${sum(customers, (c) => visitVars[c.id])} <= ${maxStops}`
      );

      // 3. Route duration constraint (transit + service time)
      sub.constraint(
        expr`${sum(customers, (c) => visitVars[c.id].mul(c.transitTime + c.serviceTime))} <= ${maxRouteTime}`
      );

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
