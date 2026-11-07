# Capacitated Vehicle Routing Problem (CVRP via Column Generation)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Combinatorial OR / Dantzig-Wolfe | HiGHS (default) | `m.solveColumnGeneration()`, `pricing`, `sum()`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">Source Code</a></li><li><a href="../guide/decomposition.md">Decomposition Guide</a></li></ul> |

The **Capacitated Vehicle Routing Problem (CVRP)** is a cornerstone problem in logistics and supply chain optimization: determine the minimum number of delivery vehicles needed to visit a set of customers, subject to vehicle cargo capacity, maximum customer stops per shift, and route duration time limits.

In a naive monolithic MIP formulation, enumerating all possible combinations and sequences of customers leads to an exponential explosion of binary variables ($O(2^n)$), causing the branch-and-bound solver to stall even for modest numbers of stops.

With **Column Generation (Dantzig-Wolfe Decomposition)**, we avoid enumerating all routes up front:
1. **Restricted Master Problem (RMP)**: Solves a set partitioning problem that selects the best combination of already-generated vehicle routes to ensure every customer is visited exactly once.
2. **Pricing Subproblem**: Inspects the **shadow prices (duals)** of customer visit constraints in the master problem to dynamically discover new, high-efficiency routes that simultaneously respect cargo capacity, stop limits, and shift duration based on inter-location travel times.

## Problem Inputs & Operational Limits

We have a central distribution depot at $(0, 0)$ and **5 customers** with 2D coordinates (km), delivery demands, and unloading service times (minutes):

| Location | Coordinates $(x, y)$ | Demand | Unloading Service Time |
| :--- | :---: | :---: | :---: |
| **Depot** | $(0, 0)$ | — | — |
| **Customer 1 (C1)** | $(20, 20)$ | 4 units | 30 min |
| **Customer 2 (C2)** | $(25, -10)$ | 3 units | 25 min |
| **Customer 3 (C3)** | $(-20, 30)$ | 5 units | 40 min |
| **Customer 4 (C4)** | $(-15, -25)$ | 2 units | 20 min |
| **Customer 5 (C5)** | $(30, 15)$ | 4 units | 35 min |

- **Operational Limits**:
  - **Vehicle Cargo Capacity**: At most **8 units** of cargo per vehicle.
  - **Maximum Stops**: At most **3 customers** visited per route.
  - **Maximum Shift Duration**: At most **180 minutes** (transit time + unloading service time) per vehicle.
- **Inter-Location Transit Times**: Computed from the Euclidean distance matrix between all pairs of nodes (assuming an average transit speed of 1 km/min).
- Total customer demand: $4 + 3 + 5 + 2 + 4 = 18$ units.
- Theoretical minimum fleet lower bound: $\lceil 18 / 8 \rceil = 3$ vehicles.

## Implementation in WaSHI

Click **▶ Run** below to solve the CVRP interactively in your browser. The pricing subproblem determines the optimal customer visit sequence using network flow conservation and Miller-Tucker-Zemlin (MTZ) subtour elimination, computing the exact route duration along traversed arcs:

<CodeRunner>

```typescript
import { Model, expr, minimize, maximize, sum } from "@ohtaman/washi";

async function runCVRP() {
  // Operational constraints
  const vehicleCapacity = 8;
  const maxStops = 3;
  const maxRouteTime = 180; // minutes

  // Depot and customer locations with 2D coordinates (km)
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

  // Inter-location transit time matrix (1 km = 1 min transit)
  const dist = nodes.map((a) =>
    nodes.map((b) => Math.round(Math.hypot(a.x - b.x, a.y - b.y)))
  );

  // 1. Build Restricted Master Problem (RMP)
  const master = new Model("CVRP_FleetMaster");

  // Initial naive routes: 1 dedicated vehicle per customer (Depot -> C_i -> Depot)
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));
  master.objective(minimize(sum(initialRoutes)));

  // Customer coverage: Each customer visited by exactly 1 vehicle
  for (let i = 0; i < customers.length; i++) {
    master.constraint(
      expr`${initialRoutes[i]} == 1`,
      `visit_${customers[i].id}`
    );
  }
  const visitConstrs = master.constraints;

  console.log("Initial state: 5 naive single-customer routes (5 vehicles).");
  console.log("Solving via Column Generation...");

  // 2. Solve via Column Generation
  const result = await master.solveColumnGeneration({
    finalizeAsMIP: true,
    pricing: async () => {
      // Pricing subproblem: Find a feasible vehicle route with negative reduced cost:
      // Reduced cost = 1 - sum(visit_i * dual_i) < 0 <=> Maximize sum(visit_i * dual_i) > 1.
      const sub = new Model("RoutePricing");

      const y = [];
      for (let i = 1; i < n; i++) y[i] = sub.binary(`y_${i}`);

      const x = [];
      for (let i = 0; i < n; i++) {
        x[i] = [];
        for (let j = 0; j < n; j++) {
          if (i !== j) x[i][j] = sub.binary(`x_${i}_${j}`);
        }
      }

      // Maximize collected dual shadow prices directly from master constraints
      sub.objective(
        maximize(sum(customers, (c, i) => y[i + 1].mul(visitConstrs[i].dual ?? 0)))
      );

      // 1. Cargo capacity limit
      sub.constraint(
        expr`${sum(customers, (c, i) => y[i + 1].mul(c.demand))} <= ${vehicleCapacity}`
      );

      // 2. Maximum stops limit
      sub.constraint(expr`${sum(customers, (c, i) => y[i + 1])} <= ${maxStops}`);

      // 3. Flow conservation (leave and enter depot at most once)
      const leaveDepot = sum(Array.from({ length: n - 1 }, (_, k) => x[0][k + 1]));
      const enterDepot = sum(Array.from({ length: n - 1 }, (_, k) => x[k + 1][0]));
      sub.constraint(expr`${leaveDepot} <= 1`);
      sub.constraint(expr`${enterDepot} == ${leaveDepot}`);

      // Customer flow conservation: in-flow == out-flow == y_i
      for (let i = 1; i < n; i++) {
        const inFlow = sum(
          Array.from({ length: n }, (_, j) => (j !== i ? x[j][i] : undefined)).filter(Boolean)
        );
        const outFlow = sum(
          Array.from({ length: n }, (_, j) => (j !== i ? x[i][j] : undefined)).filter(Boolean)
        );
        sub.constraint(expr`${inFlow} == ${y[i]}`);
        sub.constraint(expr`${outFlow} == ${y[i]}`);
      }

      // 4. MTZ Subtour Elimination
      const u = [];
      for (let i = 1; i < n; i++) u[i] = sub.continuous(`u_${i}`, { lb: 1, ub: n - 1 });
      for (let i = 1; i < n; i++) {
        for (let j = 1; j < n; j++) {
          if (i !== j) {
            sub.constraint(expr`${u[i]} - ${u[j]} + ${n} * ${x[i][j]} <= ${n - 1}`);
          }
        }
      }

      // 5. Route duration limit (arc travel time + customer service time)
      const arcTimes = [];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i !== j) arcTimes.push(x[i][j].mul(dist[i][j]));
        }
      }
      const totalTravelTime = sum(arcTimes);
      const totalServiceTime = sum(customers, (c, i) => y[i + 1].mul(c.serviceTime));
      sub.constraint(expr`${totalTravelTime} + ${totalServiceTime} <= ${maxRouteTime}`);

      await sub.solve();

      const dualProfit = sub.solution?.objectiveValue ?? 0;
      if (dualProfit <= 1 + 1e-4) return null;

      const coefficients = {};
      for (let i = 0; i < customers.length; i++) {
        if (Math.round(y[i + 1].value ?? 0) === 1) {
          coefficients[`visit_${customers[i].id}`] = 1;
        }
      }

      // Reconstruct tour path: Depot -> ... -> Depot
      const tour = ["Depot"];
      let curr = 0;
      let travelMins = 0;
      const visitedSet = new Set();
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
        `Iter ${info.iteration}: LP relaxation obj = ${info.relaxationObjective?.toFixed(2)}, columns added = ${info.columnsAdded}`
      );
    },
  });

  console.log(`\nStatus: ${result.status}`);
  console.log(`Optimal Vehicles: ${result.objectiveValue}`);
  console.log(`Total Columns Generated: ${result.columnsAdded}`);

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
}

runCVRP();
```

</CodeRunner>

## Key Takeaways

1. **True Vehicle Routing with Network Flow & MTZ Subtour Elimination**: The pricing subproblem models actual vehicle trajectories with directed arc variables $x_{ij}$, flow conservation, and MTZ order variables $u_i$, computing travel times from the distance matrix.
2. **Declarative Multi-Resource Modeling with `sum()` and `expr`**: Using WaSHI's `sum()` helper and `expr` template literals expresses cargo capacity, customer stop limits, and cumulative route duration cleanly without low-level accumulator loops.
3. **Direct Constraint Dual Access via `.dual`**: Constraint shadow prices from the master LP relaxation are directly accessible on each `Constraint` object via `c.dual`. No lookup wrapper or callback arguments are required.
4. **Decoupled Solution Metadata**: Through `meta: { tour, travelTime, totalTime }`, the full reconstructed route path and transit statistics are preserved and directly accessible from `result.generatedColumns`.
