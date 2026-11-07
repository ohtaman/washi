/**
 * Example 13: Capacitated Vehicle Routing Problem (CVRP) via Column Generation
 *
 * Demonstrates:
 * - Dantzig-Wolfe Decomposition / Column Generation for combinatorial routing (CVRP)
 * - Master problem: Fleet vehicle minimization (set partitioning)
 * - Pricing subproblem: Elementary route generation with network flow & MTZ subtour elimination
 * - Distance matrix computed from 2D depot & customer coordinates
 * - Multi-resource constraints: cargo capacity, max stops, and route duration (transit + service)
 *
 * Run with: npx tsx examples/node/13-vehicle-routing-column-generation.ts
 */

import { Model, expr, minimize, maximize, sum, type Var } from "../../src/index.js";

export interface RouteMeta {
  tour: string[];
  travelTime: number;
  totalTime: number;
}

export async function runCVRP() {
  console.log("=== Capacitated Vehicle Routing Problem (CVRP) via Column Generation ===");

  // Operational limits
  const vehicleCapacity = 8;
  const maxStops = 3;
  const maxRouteTime = 180; // minutes

  // Depot and 5 customer locations with 2D coordinates (km), demands, and unloading service times
  const depot = { id: "Depot", x: 0, y: 0 };
  const customers = [
    { id: "C1", x: 20, y: 20, demand: 4, serviceTime: 30 },
    { id: "C2", x: 25, y: -10, demand: 3, serviceTime: 25 },
    { id: "C3", x: -20, y: 30, demand: 5, serviceTime: 40 },
    { id: "C4", x: -15, y: -25, demand: 2, serviceTime: 20 },
    { id: "C5", x: 30, y: 15, demand: 4, serviceTime: 35 },
  ];

  const nodes = [depot, ...customers];
  const n = nodes.length;

  // Inter-location transit time matrix (assuming 1 km = 1 minute transit time)
  const dist: number[][] = nodes.map((a) =>
    nodes.map((b) => Math.round(Math.hypot(a.x - b.x, a.y - b.y)))
  );

  // 1. Build Restricted Master Problem (RMP)
  const master = new Model("CVRP_FleetMaster");

  // Initial naive routes: 1 dedicated vehicle per customer (Depot -> C_i -> Depot)
  const initialRoutes: Var[] = customers.map((c) => master.binary(`route_init_${c.id}`));

  // Objective: Minimize total fleet size
  master.objective(minimize(sum(initialRoutes)));

  // Customer coverage constraints: Each customer visited by exactly 1 vehicle route
  for (let i = 0; i < customers.length; i++) {
    master.constraint(
      expr`${initialRoutes[i]} == 1`,
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
      // Pricing subproblem: Find a feasible vehicle route with negative reduced cost:
      // Reduced cost = 1 - sum(visit_i * dual_i) < 0 <=> Maximize sum(visit_i * dual_i) > 1.
      const sub = new Model("RoutePricing");

      // y_i: binary variable whether customer i is visited
      const y: Var[] = [];
      for (let i = 1; i < n; i++) {
        y[i] = sub.binary(`y_${i}`);
      }

      // x_i_j: binary variable whether vehicle traverses arc from node i to node j
      const x: Var[][] = [];
      for (let i = 0; i < n; i++) {
        x[i] = [];
        for (let j = 0; j < n; j++) {
          if (i !== j) {
            x[i][j] = sub.binary(`x_${i}_${j}`);
          }
        }
      }

      // Maximize collected dual shadow prices directly from master constraints
      sub.objective(
        maximize(sum(customers, (c, i) => y[i + 1].mul(visitConstrs[i].dual ?? 0)))
      );

      // 1. Cargo capacity constraint
      sub.constraint(
        expr`${sum(customers, (c, i) => y[i + 1].mul(c.demand))} <= ${vehicleCapacity}`
      );

      // 2. Maximum stops constraint
      sub.constraint(
        expr`${sum(customers, (c, i) => y[i + 1])} <= ${maxStops}`
      );

      // 3. Flow conservation (leave and enter depot at most once)
      const leaveDepot = sum(Array.from({ length: n - 1 }, (_, k) => x[0][k + 1]));
      const enterDepot = sum(Array.from({ length: n - 1 }, (_, k) => x[k + 1][0]));
      sub.constraint(expr`${leaveDepot} <= 1`);
      sub.constraint(expr`${enterDepot} == ${leaveDepot}`);

      // Customer flow conservation: in-flow == out-flow == y_i
      for (let i = 1; i < n; i++) {
        const inFlow = sum(
          Array.from({ length: n }, (_, j) => (j !== i ? x[j][i] : undefined)).filter(Boolean) as Var[]
        );
        const outFlow = sum(
          Array.from({ length: n }, (_, j) => (j !== i ? x[i][j] : undefined)).filter(Boolean) as Var[]
        );
        sub.constraint(expr`${inFlow} == ${y[i]}`);
        sub.constraint(expr`${outFlow} == ${y[i]}`);
      }

      // 4. MTZ Subtour Elimination
      const u: Var[] = [];
      for (let i = 1; i < n; i++) {
        u[i] = sub.continuous(`u_${i}`, { lb: 1, ub: n - 1 });
      }
      for (let i = 1; i < n; i++) {
        for (let j = 1; j < n; j++) {
          if (i !== j) {
            sub.constraint(expr`${u[i]} - ${u[j]} + ${n} * ${x[i][j]} <= ${n - 1}`);
          }
        }
      }

      // 5. Route duration constraint (arc travel time + customer service time)
      const arcTimes: Var[] = [];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i !== j) {
            arcTimes.push(x[i][j].mul(dist[i][j]));
          }
        }
      }
      const totalTravelTime = sum(arcTimes);
      const totalServiceTime = sum(customers, (c, i) => y[i + 1].mul(c.serviceTime));
      sub.constraint(expr`${totalTravelTime} + ${totalServiceTime} <= ${maxRouteTime}`);

      await sub.solve();

      const dualProfit = sub.solution?.objectiveValue ?? 0;
      // Improving column exists if reduced cost < 0 <=> dualProfit > 1
      if (dualProfit <= 1 + 1e-4) {
        return null;
      }

      const coefficients: Record<string, number> = {};
      for (let i = 0; i < customers.length; i++) {
        if (Math.round(y[i + 1].value ?? 0) === 1) {
          coefficients[`visit_${customers[i].id}`] = 1;
        }
      }

      // Reconstruct tour path: Depot -> ... -> Depot
      const tour: string[] = ["Depot"];
      let curr = 0;
      let travelMins = 0;
      const visitedSet = new Set<number>();
      while (true) {
        let next = -1;
        for (let j = 0; j < n; j++) {
          if (curr !== j && Math.round(x[curr][j].value ?? 0) === 1) {
            next = j;
            break;
          }
        }
        if (next === -1 || next === 0 || visitedSet.has(next)) {
          tour.push("Depot");
          if (next === 0) travelMins += dist[curr][0];
          break;
        }
        visitedSet.add(next);
        travelMins += dist[curr][next];
        tour.push(nodes[next].id);
        curr = next;
      }

      let serviceMins = 0;
      for (let i = 0; i < customers.length; i++) {
        if (Math.round(y[i + 1].value ?? 0) === 1) {
          serviceMins += customers[i].serviceTime;
        }
      }

      return {
        cost: 1, // 1 vehicle per route
        type: "Binary",
        coefficients,
        meta: {
          tour,
          travelTime: travelMins,
          totalTime: travelMins + serviceMins,
        },
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

  console.log("\nRoutes selected in optimal fleet:");
  for (let i = 0; i < customers.length; i++) {
    if ((initialRoutes[i].value ?? 0) > 0.5) {
      const transit = dist[0][i + 1] + dist[i + 1][0];
      const total = transit + customers[i].serviceTime;
      console.log(`  Route: Depot -> ${customers[i].id} -> Depot (Transit: ${transit}m, Total: ${total}m) = ${initialRoutes[i].value}`);
    }
  }
  for (const col of result.generatedColumns) {
    if ((col.variable.value ?? 0) > 0.5) {
      const meta = col.proposal.meta;
      console.log(`  Route: ${meta?.tour.join(" -> ")} (Transit: ${meta?.travelTime}m, Total: ${meta?.totalTime}m) = ${col.variable.value}`);
    }
  }
  return result;
}

if (process.argv[1]?.includes("13-vehicle-routing-column-generation")) {
  runCVRP().catch(console.error);
}
