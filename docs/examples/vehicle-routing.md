# Capacitated Vehicle Routing Problem (CVRP, 50 Customers via Column Generation)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Combinatorial OR / Dantzig-Wolfe | HiGHS (default) | `m.solveColumnGeneration()`, `pricing`, `m.binary()`, `m.constraint()`, `expr` (`sum`) | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">Source Code</a></li><li><a href="/guide/decomposition">Decomposition Guide</a></li></ul> |

This **Capacitated Vehicle Routing Problem (CVRP)** variant minimizes the number of delivery vehicles needed to serve every customer. In addition to vehicle cargo capacity, each route must respect maximum stops per shift and route duration limits.

Enumerating every feasible route upfront in a monolithic MIP causes the number of binary variables to explode combinatorially as $n$ grows (even unordered customer subsets alone are $O(2^n)$ in general, and ordered visit sequences grow faster still). With **Column Generation (Dantzig-Wolfe Decomposition)**, routes are generated on demand:
1. **Restricted Master Problem (RMP)**: Solves the **LP relaxation** of a set partitioning problem over the generated routes during column generation (and solves it as a MIP at the end) so every customer is visited exactly once.
2. **Pricing Subproblem**: Reads dual values (shadow prices) from the master LP relaxation, then uses cheapest insertion and 2-opt search to build a route $r$ with negative reduced cost: $\bar{c}_r = 1 - \sum_{i \in r} \pi_i < 0$.

## Problem Inputs

We consider a distribution network with a central depot at $(0, 0)$ and **50 customer locations** (demands of **1 to 4 units** each):

- **Vehicle Cargo Capacity**: At most **10 units** per vehicle.
- **Maximum Stops**: At most **4 customers** per route.
- **Maximum Shift Duration**: At most **200 minutes** (transit time + service time) per route.
- **Transit & Service Times**: Integer-rounded Euclidean distances (`Math.round`) between nodes (1 unit = 1 minute) plus **10 minutes** of unloading time per customer.

## Implementation in WaSHI

<CodeRunner>

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

interface RouteMeta {
  tour: string[];
  travelTime: number;
  totalTime: number;
}

interface CandidateCustomer {
  id: string;
  demand: number;
  dual: number;
}

interface RouteConstraints {
  dist: (a: string, b: string) => number;
  serviceTimes: Record<string, number>;
  vehicleCapacity: number;
  maxStops: number;
  maxRouteTime: number;
}

// --- Extracted Routing Helpers ---

// 2-opt local search to eliminate crossing paths in a tour
function optimize2Opt(tour: string[], dist: (a: string, b: string) => number): string[] {
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

// Inserts a customer into the tour at the position that minimizes added distance
function insertCheapest(tour: string[], id: string, dist: (a: string, b: string) => number): string[] {
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

// Calculates transit time and total duration (transit + service) for a tour
function calcRouteTime(
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

// Pricing subproblem: Finds an improving route with negative reduced cost (1 - dualSum < 0)
function findImprovingRoute(candidates: CandidateCustomer[], config: RouteConstraints): string[] | null {
  let bestRoute: string[] | null = null;
  let minReducedCost = -1e-4;

  for (const seed of candidates.slice(0, 15)) {
    let tour = ["Depot", seed.id, "Depot"];
    let load = seed.demand;
    let dualSum = seed.dual;

    for (const next of candidates) {
      if (tour.includes(next.id)) continue;
      if (load + next.demand > config.vehicleCapacity) continue;
      if (tour.length - 2 >= config.maxStops) continue;

      const candidateTour = optimize2Opt(insertCheapest(tour, next.id, config.dist), config.dist);
      const { totalTime } = calcRouteTime(candidateTour, config.dist, config.serviceTimes);

      if (totalTime <= config.maxRouteTime) {
        tour = candidateTour;
        load += next.demand;
        dualSum += next.dual;
      }
    }

    const reducedCost = 1 - dualSum;
    if (reducedCost < minReducedCost) {
      minReducedCost = reducedCost;
      bestRoute = tour;
    }
  }
  return bestRoute;
}

// --- Main CVRP via Column Generation ---

async function runCVRP() {
  const vehicleCapacity = 10;
  const maxStops = 4;
  const maxRouteTime = 200; // minutes

  // Central depot and 50 customer locations
  const depot = { id: "Depot", x: 0, y: 0 };
  const customers = Array.from({ length: 50 }, (_, i) => {
    const angle = i * 2.4;
    const radius = 15 + (i % 5) * 8;
    return {
      id: `C${i + 1}`,
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
      demand: 1 + (i % 4),
      serviceTime: 10,
    };
  });

  const nodes = Object.fromEntries([depot, ...customers].map((n) => [n.id, n]));
  const dist = (a: string, b: string) =>
    Math.round(Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y));
  const serviceTimes = Object.fromEntries(customers.map((c) => [c.id, c.serviceTime]));

  const routeConfig: RouteConstraints = { dist, serviceTimes, vehicleCapacity, maxStops, maxRouteTime };

  // 1. Build Restricted Master Problem (RMP)
  const master = new Model("CVRP_FleetMaster");

  // Initial naive routes: 1 dedicated vehicle per customer
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));
  master.objective(minimize(expr`sum(${initialRoutes})`));

  // Set-partitioning constraints: each customer must be visited by exactly 1 vehicle
  const visitConstrs = customers.map((c, i) =>
    master.constraint(expr`${initialRoutes[i]} == 1`, `visit_${c.id}`)
  );

  console.log(`Initial state: 50 naive single-customer routes (50 vehicles).`);
  console.log("Solving via Column Generation with dual-directed heuristic pricing...");

  // 2. Solve via Column Generation
  const result = await master.solveColumnGeneration<RouteMeta>({
    finalizeAsMIP: true,
    pricing: async () => {
      // 1. Sort customers by shadow price (dual profit) descending
      const candidates = customers
        .map((c, i) => ({ id: c.id, demand: c.demand, dual: visitConstrs[i].dual ?? 0 }))
        .filter((c) => c.dual > 0)
        .sort((a, b) => b.dual - a.dual);

      // 2. Solve pricing subproblem: find route with negative reduced cost (dualSum > 1)
      const bestRoute = findImprovingRoute(candidates, routeConfig);
      if (!bestRoute) return null; // No improving column found

      // 3. Propose new column to Restricted Master Problem
      const { travelTime, totalTime } = calcRouteTime(bestRoute, dist, serviceTimes);
      const coefficients: Record<string, number> = {};
      for (const id of bestRoute.slice(1, -1)) {
        coefficients[`visit_${id}`] = 1;
      }

      return {
        cost: 1,
        type: "Binary" as const,
        coefficients,
        meta: { tour: bestRoute, travelTime, totalTime },
      };
    },
  });

  console.log(`\nStatus: ${result.status}`);
  console.log(`Fleet Size: ${Math.round(result.objectiveValue ?? 0)} vehicles (heuristic column generation)`);
  console.log(`Total Columns Generated: ${result.columnsAdded}`);

  console.log("\nSample routes selected in fleet:");
  const activeRoutes: RouteMeta[] = [];
  for (let i = 0; i < customers.length; i++) {
    if (initialRoutes[i].value === 1) {
      const tour = ["Depot", customers[i].id, "Depot"];
      const { travelTime, totalTime } = calcRouteTime(tour, dist, serviceTimes);
      activeRoutes.push({ tour, travelTime, totalTime });
    }
  }
  for (const c of result.generatedColumns) {
    if (c.variable.value === 1 && c.proposal.meta) {
      activeRoutes.push(c.proposal.meta);
    }
  }
  for (const r of activeRoutes.slice(0, 5)) {
    console.log(`  ${r.tour.join(" -> ")} (Transit: ${r.travelTime}m, Total: ${r.totalTime}m)`);
  }
}

runCVRP();
```

</CodeRunner>

## Key Takeaways

### Master Problem, Pricing & Route Metadata

The master problem handles the LP relaxation and final set-partitioning MIP. Inside `pricing`, `visitConstrs[i].dual` supplies each customer's dual value (shadow price) to guide route construction. Storing `{ tour, travelTime, totalTime }` in `meta` lets you inspect the chosen stop sequence via `result.generatedColumns` after solving.

### Set Partitioning (`== 1`) vs. Set Covering (`>= 1`)

This example uses `== 1` so no customer is visited twice in the final MIP. In larger instances, using `>= 1` keeps dual values non-negative ($\pi_i \ge 0$) and stabilizes LP convergence. When travel distances satisfy the triangle inequality, duplicate visits can be stripped after solving without increasing any route's travel time (or load, stop count, or fleet size); note that rounding distances with `Math.round` as in this example can introduce small rounding violations of the triangle inequality.

### Heuristic Pricing vs. Exact ESPPRC

Here `findImprovingRoute` runs a greedy cheapest-insertion and 2-opt heuristic instead of an exact Elementary Shortest Path Problem with Resource Constraints (ESPPRC) solver. Returning `null` therefore means the heuristic found no further improving route, rather than proving global LP optimality.

### Price-and-Branch (`finalizeAsMIP: true`)

Solving the Restricted Master Problem as a MIP over the columns generated at the root node is called the **Restricted Master Heuristic** (Price-and-Branch). It produces strong integer fleets quickly without implementing a full Branch-and-Price search tree.
