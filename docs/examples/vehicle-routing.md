# Capacitated Vehicle Routing Problem (CVRP, 50 Customers via Column Generation)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Combinatorial OR / Dantzig-Wolfe | HiGHS (default) | `m.solveColumnGeneration()`, `pricing`, `sum()`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">Source Code</a></li><li><a href="../guide/decomposition.md">Decomposition Guide</a></li></ul> |

The **Capacitated Vehicle Routing Problem (CVRP)** determines the minimum number of delivery vehicles needed to visit a set of customers, subject to vehicle cargo capacity, maximum customer stops per shift, and route duration limits.

In a monolithic MIP formulation, enumerating all possible customer combinations and visit sequences leads to $O(2^n)$ binary variables. With **Column Generation (Dantzig-Wolfe Decomposition)**, routes are generated on demand:
1. **Restricted Master Problem (RMP)**: Solves a set partitioning problem that selects a subset of candidate routes so that every customer is visited once.
2. **Pricing Subproblem**: Uses the dual values (shadow prices) from the master LP relaxation to construct improving routes with negative reduced cost ($\bar{c} = 1 - \sum \pi_i < 0$) via cheapest insertion and 2-opt local search.

## Problem Inputs

We consider a distribution network with a central depot at $(0, 0)$ and **50 customer locations**:

- **Vehicle Cargo Capacity**: At most **10 units** per vehicle.
- **Maximum Stops**: At most **4 customers** per route.
- **Maximum Shift Duration**: At most **200 minutes** (transit time + service time) per route.
- **Transit & Service Times**: Euclidean distances between nodes (1 unit = 1 minute) plus **10 minutes** of unloading service time per customer.

## Implementation in WaSHI

<CodeRunner>

```typescript
import { Model, expr, minimize, sum } from "@ohtaman/washi";

// --- Extracted Routing Helpers ---

// 2-opt local search to eliminate crossing paths in a tour
function optimize2Opt(tour, dist) {
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

// Inserts a customer into the tour at the position that minimizes detour distance
function insertCheapest(tour, id, dist) {
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
function calcRouteTime(tour, dist, serviceTimes) {
  let travelTime = 0;
  for (let i = 0; i < tour.length - 1; i++) {
    travelTime += dist(tour[i], tour[i + 1]);
  }
  const serviceTime = tour.slice(1, -1).reduce((acc, id) => acc + (serviceTimes[id] ?? 0), 0);
  return { travelTime, totalTime: travelTime + serviceTime };
}

// Pricing subproblem: Finds an improving route with negative reduced cost (1 - dualSum < 0)
function findImprovingRoute(candidates, config) {
  let bestRoute = null;
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
  const dist = (a, b) =>
    Math.round(Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y));
  const serviceTimes = Object.fromEntries(customers.map((c) => [c.id, c.serviceTime]));

  const routeConfig = { dist, serviceTimes, vehicleCapacity, maxStops, maxRouteTime };

  // 1. Build Restricted Master Problem (RMP)
  const master = new Model("CVRP_FleetMaster");

  // Initial naive routes: 1 dedicated vehicle per customer
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));
  master.objective(minimize(sum(initialRoutes)));

  // Each customer must be visited by exactly 1 vehicle
  const visitConstrs = customers.map((c, i) =>
    master.constraint(expr`${initialRoutes[i]} == 1`, `visit_${c.id}`)
  );

  console.log(`Initial state: 50 naive single-customer routes (50 vehicles).`);
  console.log("Solving via Column Generation with dual-directed heuristic pricing...");

  // 2. Solve via Column Generation
  const result = await master.solveColumnGeneration({
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
      const coefficients = {};
      for (const id of bestRoute.slice(1, -1)) {
        coefficients[`visit_${id}`] = 1;
      }

      return {
        cost: 1,
        type: "Binary",
        coefficients,
        meta: { tour: bestRoute, travelTime, totalTime },
      };
    },
  });

  console.log(`\nStatus: ${result.status}`);
  console.log(`Fleet Size: ${Math.round(result.objectiveValue ?? 0)} vehicles (heuristic column generation)`);
  console.log(`Total Columns Generated: ${result.columnsAdded}`);

  console.log("\nSample routes selected in fleet:");
  const activeRoutes = result.generatedColumns.filter((c) => c.variable.value === 1);
  for (const r of activeRoutes.slice(0, 5)) {
    const meta = r.proposal.meta;
    console.log(`  ${meta?.tour.join(" -> ")} (Transit: ${meta?.travelTime}m, Total: ${meta?.totalTime}m)`);
  }
}

runCVRP();
```

</CodeRunner>

## Notes

- **Master Problem and Pricing Separation**: The master problem solves the LP relaxation and final set-partitioning MIP, while the `pricing` callback searches for negative-reduced-cost routes using cheapest insertion and 2-opt local search.
- **Dual Value Access**: Dual values from the master LP relaxation are read from `visitConstrs[i].dual` to prioritize customers with higher shadow prices during route construction.
- **Route Metadata**: Each proposed column attaches `{ tour, travelTime, totalTime }` under `meta`, allowing the ordered stop sequence to be inspected from `result.generatedColumns` after the solve completes.
- **Set Partitioning (`== 1`) vs. Set Covering (`>= 1`)**: This example uses `== 1` so that the final MIP never covers a customer twice. In large-scale column generation, formulating coverage as `>= 1` restricts the dual prices to $\pi_i \ge 0$, avoiding negative dual oscillations; if the final MIP selects overlapping routes, duplicate visits can be removed by post-processing whenever distances satisfy the triangle inequality.
- **Heuristic Pricing vs. Exact ESPPRC**: Because `findImprovingRoute` uses a fast greedy heuristic (cheapest insertion + 2-opt) instead of an exact Elementary Shortest Path Problem with Resource Constraints (ESPPRC) solver, returning `null` means no further improving columns were found by the heuristic rather than proving global LP optimality.
- **Price-and-Branch (`finalizeAsMIP: true`)**: Solving the Restricted Master Problem as a MIP over the columns generated at the root node is known as the *Restricted Master Heuristic* (Price-and-Branch). It produces near-optimal integer fleets quickly without requiring full Branch-and-Price tree search.
