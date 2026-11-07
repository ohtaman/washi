# Capacitated Vehicle Routing Problem (CVRP via Column Generation)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Combinatorial OR / Dantzig-Wolfe | HiGHS (default) | `m.solveColumnGeneration()`, `pricing`, `sum()`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">Source Code</a></li><li><a href="../guide/decomposition.md">Decomposition Guide</a></li></ul> |

The **Capacitated Vehicle Routing Problem (CVRP)** is a cornerstone problem in logistics and supply chain optimization: determine the minimum number of delivery vehicles needed to visit a set of customers, subject to vehicle cargo capacity, maximum customer stops per shift, and route duration time limits.

In a naive monolithic MIP formulation, enumerating all possible combinations of customers leads to an exponential explosion of binary variables ($O(2^n)$), causing the branch-and-bound solver to stall even for modest numbers of stops.

With **Column Generation (Dantzig-Wolfe Decomposition)**, we avoid enumerating all routes up front:
1. **Restricted Master Problem (RMP)**: Solves a set-covering formulation that selects the best combination of already-generated vehicle routes to ensure every customer is visited at least once.
2. **Pricing Subproblem**: Inspects the **shadow prices (duals)** of customer visit constraints in the master problem to dynamically discover new, high-efficiency routes that simultaneously respect cargo capacity, stop limits, and shift duration.

## Problem Inputs & Operational Limits

We have **5 customers** served from a central distribution depot under 3 real-world operational constraints:
- **Vehicle Cargo Capacity**: At most **8 units** of cargo per vehicle.
- **Maximum Stops**: At most **3 customers** visited per route.
- **Maximum Shift Duration**: At most **180 minutes** (transit time + unloading service time) per vehicle.

| Customer | Delivery Demand | Service Time | Transit from Depot | Combined Route Time |
| :--- | :---: | :---: | :---: | :---: |
| **Customer 1 (C1)** | 4 units | 30 min | 20 min | 50 min |
| **Customer 2 (C2)** | 3 units | 25 min | 30 min | 55 min |
| **Customer 3 (C3)** | 5 units | 40 min | 15 min | 55 min |
| **Customer 4 (C4)** | 2 units | 20 min | 25 min | 45 min |
| **Customer 5 (C5)** | 4 units | 35 min | 20 min | 55 min |

- Total customer demand: $4 + 3 + 5 + 2 + 4 = 18$ units.
- Theoretical minimum fleet lower bound: $\lceil 18 / 8 \rceil = 3$ vehicles.

## Implementation in WaSHI

Click **▶ Run** below to solve the CVRP interactively in your browser. Notice how clean the formulation is using WaSHI's `sum()` helper and `expr` templates—zero low-level accumulator loops or manual expression builders required:

<CodeRunner>

```typescript
import { Model, expr, minimize, maximize, sum } from "@ohtaman/washi";

async function runCVRP() {
  // Operational constraints
  const vehicleCapacity = 8;  // Maximum cargo units
  const maxStops = 3;         // Maximum customer stops per vehicle
  const maxRouteTime = 180;   // Maximum shift duration in minutes

  const customers = [
    { id: "C1", demand: 4, serviceTime: 30, transitTime: 20 },
    { id: "C2", demand: 3, serviceTime: 25, transitTime: 30 },
    { id: "C3", demand: 5, serviceTime: 40, transitTime: 15 },
    { id: "C4", demand: 2, serviceTime: 20, transitTime: 25 },
    { id: "C5", demand: 4, serviceTime: 35, transitTime: 20 },
  ];

  // 1. Build Restricted Master Problem (RMP)
  const master = new Model("CVRP_FleetMaster");

  // Initial naive routes: 1 dedicated vehicle per customer
  const initialRoutes = customers.map((c) => master.binary(`route_init_${c.id}`));

  // Objective: Minimize total fleet size
  master.objective(minimize(sum(initialRoutes)));

  // Customer coverage constraints: Each customer must be visited by at least 1 route
  for (let i = 0; i < customers.length; i++) {
    master.constraint(
      expr`${initialRoutes[i]} >= 1`,
      `visit_${customers[i].id}`
    );
  }

  console.log("Initial state: 5 naive single-customer routes (5 vehicles).");
  console.log("Solving via Column Generation...");

  // 2. Solve via Column Generation
  const result = await master.solveColumnGeneration({
    finalizeAsMIP: true,
    pricing: async ({ getDual }) => {
      // Pricing subproblem: Given customer shadow prices, find an improving route
      // that simultaneously satisfies capacity, stop limits, and shift duration.
      const sub = new Model("RoutePricing");

      const visitVars = Object.fromEntries(
        customers.map((c) => [c.id, sub.binary(`v_${c.id}`)])
      );

      // Maximize collected shadow price (dual) revenue
      sub.objective(
        maximize(sum(customers, (c) => visitVars[c.id].mul(getDual(`visit_${c.id}`))))
      );

      // Resource 1: Cargo capacity constraint
      sub.constraint(
        expr`${sum(customers, (c) => visitVars[c.id].mul(c.demand))} <= ${vehicleCapacity}`
      );

      // Resource 2: Maximum stops constraint
      sub.constraint(
        expr`${sum(customers, (c) => visitVars[c.id])} <= ${maxStops}`
      );

      // Resource 3: Route duration constraint (transit + service time)
      sub.constraint(
        expr`${sum(customers, (c) => visitVars[c.id].mul(c.transitTime + c.serviceTime))} <= ${maxRouteTime}`
      );

      await sub.solve();

      const coefficients = {};
      const visited = [];
      for (const c of customers) {
        if (Math.round(visitVars[c.id].value ?? 0) === 1) {
          coefficients[`visit_${c.id}`] = 1;
          visited.push(c.id);
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
        `Iter ${info.iteration}: LP relaxation obj = ${info.relaxationObjective?.toFixed(2)}, columns added = ${info.columnsAdded}`
      );
    },
  });

  console.log(`\nStatus: ${result.status}`);
  console.log(`Optimal Vehicles: ${result.objectiveValue}`);
  console.log(`Total Columns Generated: ${result.columnsAdded}`);

  console.log("\nGenerated routes selected in optimal fleet:");
  for (const col of result.generatedColumns) {
    if ((col.variable.value ?? 0) > 0.5) {
      console.log(`  ${col.variable.name} (visits: [${col.proposal.meta?.visitedCustomers.join(", ")}]) = ${col.variable.value}`);
    }
  }
}

runCVRP();
```

</CodeRunner>

## Key Takeaways

1. **Declarative Multi-Resource Modeling with `sum()` and `expr`**: Using WaSHI's `sum()` helper and `expr` template literals eliminates verbose manual accumulator loops, expressing cargo capacity, maximum customer stops, and route duration constraints cleanly.
2. **Decoupled Constraint Duality via `getDual`**: In linear programming duality, shadow prices belong to constraints (not variables). The `getDual("visit_C1")` helper seamlessly reads the master LP relaxation dual values without manual index tracking.
3. **Decoupled Solution Metadata**: Through `meta: { visitedCustomers: visited }`, you can attach arbitrary domain objects (such as customer stop lists or GPS waypoints) and recover them directly from `result.generatedColumns` without parsing generated variable names.
