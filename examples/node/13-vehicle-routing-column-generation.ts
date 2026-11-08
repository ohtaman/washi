/**
 * Example 13: Capacitated Vehicle Routing Problem (CVRP, 50 Customers) via Column Generation
 *
 * Demonstrates:
 * - Dantzig-Wolfe Decomposition / Column Generation for combinatorial routing (CVRP)
 * - Master problem: Fleet vehicle minimization (set partitioning) solved via mathematical optimization (LP relaxation + MIP finalization)
 * - Pricing subproblem: Dual-directed heuristic route generation using cheapest insertion and 2-opt local search
 * - Decoupled architecture: Fast domain-specific routing heuristics combined with exact set partitioning
 * - Scales to 50+ customers in hundreds of milliseconds without heavy MIP pricing
 *
 * Run with: npx tsx examples/node/13-vehicle-routing-column-generation.ts
 */

import { Model, expr, minimize, sum } from "../../src/index.js";

export interface RouteMeta {
  tour: string[];
  travelTime: number;
  totalTime: number;
}

export interface CandidateCustomer {
  id: string;
  demand: number;
  dual: number;
}

export interface RouteConstraints {
  dist: (a: string, b: string) => number;
  serviceTimes: Record<string, number>;
  vehicleCapacity: number;
  maxStops: number;
  maxRouteTime: number;
}

/**
 * 2-opt local search to eliminate path crossings and minimize tour distance.
 */
export function optimize2Opt(tour: string[], dist: (a: string, b: string) => number): string[] {
  let best = [...tour];
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 2; i++) {
      for (let j = i + 1; j < best.length - 1; j++) {
        const dCurrent = dist(best[i - 1], best[i]) + dist(best[j], best[j + 1]);
        const dSwap = dist(best[i - 1], best[j]) + dist(best[i], best[j + 1]);
        if (dSwap < dCurrent) {
          best = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return best;
}

/**
 * Inserts a customer into the tour at the position that minimizes added detour distance.
 */
export function insertCheapest(tour: string[], id: string, dist: (a: string, b: string) => number): string[] {
  let bestPos = 1;
  let minCost = Infinity;

  for (let p = 1; p < tour.length; p++) {
    const cost = dist(tour[p - 1], id) + dist(id, tour[p]) - dist(tour[p - 1], tour[p]);
    if (cost < minCost) {
      minCost = cost;
      bestPos = p;
    }
  }
  return [...tour.slice(0, bestPos), id, ...tour.slice(bestPos)];
}

/**
 * Calculates transit time and total duration (transit + unloading service) for a tour.
 */
export function calcRouteTime(
  tour: string[],
  dist: (a: string, b: string) => number,
  serviceTimes: Record<string, number>
) {
  let travelTime = 0;
  for (let i = 0; i < tour.length - 1; i++) {
    travelTime += dist(tour[i], tour[i + 1]);
  }
  const serviceTime = tour.slice(1, -1).reduce((acc, id) => acc + (serviceTimes[id] ?? 0), 0);
  return { travelTime, totalTime: travelTime + serviceTime };
}

/**
 * Pricing subproblem: Finds an improving vehicle route with negative reduced cost (reducedCost = 1 - sum(dual_i) < 0)
 * using cheapest insertion and 2-opt local search.
 */
export function findImprovingRoute(
  candidates: CandidateCustomer[],
  config: RouteConstraints
): string[] | null {
  let bestRoute: string[] | null = null;
  let minReducedCost = -1e-4;

  // Seed routes with the highest-dual candidate customers
  for (const seed of candidates.slice(0, 15)) {
    let tour = ["Depot", seed.id, "Depot"];
    let load = seed.demand;
    let dualSum = seed.dual;

    for (const next of candidates) {
      if (tour.includes(next.id)) continue;
      if (load + next.demand > config.vehicleCapacity) continue;
      if (tour.length - 2 >= config.maxStops) continue;

      // Greedily insert with cheapest detour and untangle with 2-opt
      const candidateTour = optimize2Opt(insertCheapest(tour, next.id, config.dist), config.dist);
      const { totalTime } = calcRouteTime(candidateTour, config.dist, config.serviceTimes);

      if (totalTime <= config.maxRouteTime) {
        tour = candidateTour;
        load += next.demand;
        dualSum += next.dual;
      }
    }

    // Reduced cost = route cost (1) - collected dual shadow prices
    const reducedCost = 1 - dualSum;
    if (reducedCost < minReducedCost) {
      minReducedCost = reducedCost;
      bestRoute = tour;
    }
  }

  return bestRoute;
}

export async function runCVRP() {
  console.log("=== Capacitated Vehicle Routing Problem (50 Customers) via Column Generation ===");

  // Operational limits
  const vehicleCapacity = 10; // units
  const maxStops = 4;        // max customer stops per vehicle
  const maxRouteTime = 200;  // minutes (transit + service time)

  // Central depot at (0, 0) and 50 customer locations
  const depot = { id: "Depot", x: 0, y: 0 };
  const customers = Array.from({ length: 50 }, (_, i) => {
    const angle = i * 2.4;
    const radius = 15 + (i % 5) * 8;
    return {
      id: `C${i + 1}`,
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
      demand: 1 + (i % 4), // 1 to 4 units
      serviceTime: 10,     // 10 minutes unloading
    };
  });

  const nodes = Object.fromEntries([depot, ...customers].map((n) => [n.id, n]));
  const dist = (a: string, b: string) =>
    Math.round(Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y));
  const serviceTimes = Object.fromEntries(customers.map((c) => [c.id, c.serviceTime]));

  const routeConfig: RouteConstraints = {
    dist,
    serviceTimes,
    vehicleCapacity,
    maxStops,
    maxRouteTime,
  };

  // 1. Build Restricted Master Problem (RMP)
  const master = new Model("CVRP_FleetMaster");

  // Initial naive routes: 1 dedicated vehicle per customer (Depot -> C_i -> Depot)
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));
  master.objective(minimize(sum(initialRoutes)));

  // Customer coverage constraints: Each customer must be visited by at least 1 vehicle.
  // Note: Using `== 1` (Set Partitioning) guarantees no duplicate customer visits across routes,
  // whereas `>= 1` (Set Covering) restricts duals to non-negative values (dual_i >= 0), stabilizing
  // LP convergence when the triangle inequality holds (any duplicate visit can be shortcut later).
  for (let i = 0; i < customers.length; i++) {
    master.constraint(expr`${initialRoutes[i]} == 1`, `visit_${customers[i].id}`);
  }
  const visitConstrs = master.constraints;

  console.log(`Initial state: ${customers.length} naive single-customer routes (${customers.length} vehicles).`);
  console.log("Solving Column Generation with dual-directed heuristic pricing...");

  // 2. Solve via Column Generation (Price-and-Branch: LP column generation followed by MIP finalization)
  const result = await master.solveColumnGeneration<RouteMeta>({
    finalizeAsMIP: true,
    pricing: async () => {
      // 1. Collect positive dual values (shadow prices) from master visit constraints
      const candidates = customers
        .map((c, i) => ({ id: c.id, demand: c.demand, dual: visitConstrs[i].dual ?? 0 }))
        .filter((c) => c.dual > 0)
        .sort((a, b) => b.dual - a.dual);

      // 2. Solve pricing subproblem: find route with negative reduced cost (dualSum > 1).
      // Note: Because pricing uses a fast heuristic (cheapest insertion + 2-opt) rather than
      // an exact ESPPRC solver, termination when `bestRoute === null` yields a high-quality
      // heuristic LP solution rather than a certified global LP lower bound.
      const bestRoute = findImprovingRoute(candidates, routeConfig);
      if (!bestRoute) return null; // No improving column found by heuristic pricing

      // 3. Propose new column to Restricted Master Problem
      const { travelTime, totalTime } = calcRouteTime(bestRoute, dist, serviceTimes);
      const coefficients: Record<string, number> = {};
      for (const id of bestRoute.slice(1, -1)) {
        coefficients[`visit_${id}`] = 1;
      }

      return {
        cost: 1, // 1 vehicle per route
        type: "Binary",
        coefficients,
        meta: {
          tour: bestRoute,
          travelTime,
          totalTime,
        },
      };
    },
    onIteration: (info) => {
      if (info.iteration % 10 === 0 || info.iteration <= 5) {
        console.log(
          `  Iter ${info.iteration}: LP relaxation obj = ${info.relaxationObjective?.toFixed(3)}, columns added = ${info.columnsAdded}`
        );
      }
    },
  });

  console.log(`\nStatus: ${result.status}`);
  console.log(`Fleet Size: ${Math.round(result.objectiveValue ?? 0)} vehicles (heuristic column generation)`);
  console.log(`Total Columns Generated: ${result.columnsAdded}`);
  console.log(`Total Iterations: ${result.iterations}`);

  console.log("\nRoutes selected in fleet:");
  let vehicleNum = 1;
  for (let i = 0; i < customers.length; i++) {
    if (initialRoutes[i].value === 1) {
      const transit = dist("Depot", customers[i].id) + dist(customers[i].id, "Depot");
      const total = transit + customers[i].serviceTime;
      console.log(`  Vehicle ${vehicleNum++}: Depot -> ${customers[i].id} -> Depot (Transit: ${transit}m, Total: ${total}m)`);
    }
  }
  for (const col of result.generatedColumns) {
    if (col.variable.value === 1) {
      const meta = col.proposal.meta;
      console.log(`  Vehicle ${vehicleNum++}: ${meta?.tour.join(" -> ")} (Transit: ${meta?.travelTime}m, Total: ${meta?.totalTime}m)`);
    }
  }

  return result;
}

if (process.argv[1]?.includes("13-vehicle-routing-column-generation")) {
  runCVRP().catch(console.error);
}
