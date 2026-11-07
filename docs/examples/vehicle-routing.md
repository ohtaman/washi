# Capacitated Vehicle Routing Problem (CVRP, 50 Customers via Column Generation)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Combinatorial OR / Dantzig-Wolfe | HiGHS (default) | `m.solveColumnGeneration()`, `pricing`, `sum()`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">Source Code</a></li><li><a href="../guide/decomposition.md">Decomposition Guide</a></li></ul> |

The **Capacitated Vehicle Routing Problem (CVRP)** is a cornerstone problem in logistics and supply chain optimization: determine the minimum number of delivery vehicles needed to visit a large set of customers, subject to vehicle cargo capacity, maximum customer stops per shift, and route duration time limits.

In a naive monolithic MIP formulation, enumerating all possible combinations and sequences of customers leads to an exponential explosion of binary variables ($O(2^n)$), causing the branch-and-bound solver to stall even for modest numbers of stops.

With **Column Generation (Dantzig-Wolfe Decomposition)**, we avoid enumerating all routes up front:
1. **Restricted Master Problem (RMP)**: Solves a set partitioning problem that selects the best combination of candidate vehicle routes to ensure every customer is visited exactly once.
2. **Pricing Subproblem (Heuristic Route Generation)**: In real-world routing frameworks (such as Branch-and-Price), solving subproblems as full MIPs is notoriously inefficient. Instead, pricing is solved with **fast domain heuristics (cheapest insertion & 2-opt local search)** guided by the **shadow prices (duals)** of the master problem to dynamically discover improving routes.

## Problem Inputs & Operational Limits

We consider a distribution network with a central depot at $(0, 0)$ and **50 customer delivery locations** scattered across surrounding zones:

- **Operational Limits**:
  - **Vehicle Cargo Capacity**: At most **10 units** of cargo per vehicle.
  - **Maximum Stops**: At most **4 customers** visited per route.
  - **Maximum Shift Duration**: At most **200 minutes** (transit time + unloading service time) per vehicle.
- **Inter-Location Transit Times**: Computed from the pairwise Euclidean distance matrix between all nodes (assuming an average transit speed of 1 km/min).
- **Unloading Service Time**: 10 minutes per customer.

## Implementation in WaSHI

Click **▶ Run** below to solve the 50-customer CVRP interactively in your browser. Notice how cleanly the routing heuristics (`insertCheapest`, `optimize2Opt`) are extracted, leaving the master problem and pricing loop concise, readable, and lightning-fast (~500 ms in WebAssembly):

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

  // 1. Build Restricted Master Problem (RMP)
  const master = new Model("CVRP_FleetMaster");

  // Initial naive routes: 1 dedicated vehicle per customer
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));
  master.objective(minimize(sum(initialRoutes)));

  // Each customer must be visited by exactly 1 vehicle
  for (let i = 0; i < customers.length; i++) {
    master.constraint(expr`${initialRoutes[i]} == 1`, `visit_${customers[i].id}`);
  }
  const visitConstrs = master.constraints;

  console.log(`Initial state: 50 naive single-customer routes (50 vehicles).`);
  console.log("Solving via Column Generation with dual-directed heuristic pricing...");

  // 2. Solve via Column Generation
  const result = await master.solveColumnGeneration({
    finalizeAsMIP: true,
    pricing: async () => {
      // Sort customers by shadow price (dual profit) descending
      const candidates = customers
        .map((c, i) => ({ ...c, dual: visitConstrs[i].dual ?? 0 }))
        .filter((c) => c.dual > 0)
        .sort((a, b) => b.dual - a.dual);

      let bestRoute: string[] | null = null;
      let minReducedCost = -1e-4;

      // Seed candidate routes with top shadow-price customers
      for (const seed of candidates.slice(0, 15)) {
        let tour = ["Depot", seed.id, "Depot"];
        let load = seed.demand;
        let dualSum = seed.dual;

        for (const next of candidates) {
          if (tour.includes(next.id)) continue;
          if (load + next.demand > vehicleCapacity) continue;
          if (tour.length - 2 >= maxStops) continue;

          // Greedily insert with cheapest detour and untangle with 2-opt
          const candidateTour = optimize2Opt(insertCheapest(tour, next.id, dist), dist);
          const { totalTime } = calcRouteTime(candidateTour, dist, serviceTimes);

          if (totalTime <= maxRouteTime) {
            tour = candidateTour;
            load += next.demand;
            dualSum += next.dual;
          }
        }

        // Reduced cost = route cost (1) - dualSum
        const reducedCost = 1 - dualSum;
        if (reducedCost < minReducedCost) {
          minReducedCost = reducedCost;
          bestRoute = tour;
        }
      }

      // No improving route found: LP relaxation is optimal
      if (!bestRoute) return null;

      const { travelTime, totalTime } = calcRouteTime(bestRoute, dist, serviceTimes);
      const coefficients: Record<string, number> = {};
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
  const activeRoutes = result.generatedColumns.filter((c) => (c.variable.value ?? 0) > 0.5);
  for (const r of activeRoutes.slice(0, 5)) {
    const meta = r.proposal.meta;
    console.log(`  ${meta?.tour.join(" -> ")} (Transit: ${meta?.travelTime}m, Total: ${meta?.totalTime}m)`);
  }
}

runCVRP();
```

</CodeRunner>

## Key Takeaways

1. **Hybrid Architecture (Exact Master × Heuristic Pricing)**: In industrial Branch-and-Price frameworks, the pricing subproblem does not require an expensive MIP solver. By combining mathematical programming (LP relaxation & set partitioning MIP in the master) with fast domain heuristics (cheapest insertion & 2-opt), decomposition achieves massive performance gains.
2. **Scales to 50+ Customers in Hundreds of Milliseconds**: Bypassing subproblem MIPs avoids combinatorial tree explosion and Emscripten memory barriers, enabling large-scale routing optimization directly inside the browser.
3. **Clean Code with Extracted Domain Helpers**: Keeping routing algorithms (`optimize2Opt`, `insertCheapest`, `calcRouteTime`) decoupled from the modeling API ensures both the business logic and the mathematical master problem remain crystal clear.
4. **Direct Shadow Price Access via `.dual`**: Shadow prices (dual values) from the master LP relaxation are read directly from `visitConstrs[i].dual` to steer the heuristic toward the most lucrative customer combinations.
