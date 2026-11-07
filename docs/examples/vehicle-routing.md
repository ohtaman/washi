# Capacitated Vehicle Routing Problem (CVRP via Column Generation)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Combinatorial OR / Dantzig-Wolfe | HiGHS (default) | `m.solveColumnGeneration()`, `pricing`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts">Source Code</a></li><li><a href="../guide/decomposition.md">Decomposition Guide</a></li></ul> |

The **Capacitated Vehicle Routing Problem (CVRP)** is a cornerstone problem in logistics and supply chain optimization: determine the minimum number of vehicles (or minimum fleet routing cost) needed to visit a set of geographically dispersed customers, where each customer has a specific demand and each vehicle has a limited cargo capacity.

In a naive monolithic MIP formulation, enumerating all possible subsets of customers that a vehicle could visit leads to an exponential explosion of binary variables ($O(2^n)$), causing the branch-and-bound tree to stall even for modest instances.

With **Column Generation (Dantzig-Wolfe Decomposition)**, we avoid enumerating all routes up front:
1. **Restricted Master Problem (RMP)**: Starts with a small set of naive routes (e.g. 1 dedicated truck per customer) and chooses the best combination of routes to cover every customer.
2. **Pricing Subproblem**: Inspects the **shadow prices (duals)** of the customer coverage constraints in the master problem to dynamically discover new, high-efficiency routes that combine multiple customers within vehicle capacity.

## Problem Inputs

We have **5 customers** with demands and identical delivery trucks with a capacity of **8 units**:

| Customer | Delivery Demand | Minimum Vehicle Capacity |
| :--- | :---: | :---: |
| **Customer 1 (C1)** | 4 units | 8 units |
| **Customer 2 (C2)** | 3 units | 8 units |
| **Customer 3 (C3)** | 5 units | 8 units |
| **Customer 4 (C4)** | 2 units | 8 units |
| **Customer 5 (C5)** | 4 units | 8 units |

- Total customer demand: $4 + 3 + 5 + 2 + 4 = 18$ units.
- Theoretical minimum fleet lower bound: $\lceil 18 / 8 \rceil = 3$ vehicles.

## Implementation in WaSHI

Click **▶ Run** below to solve the CVRP interactively in your browser. WaSHI will iteratively solve the continuous LP relaxation, query the pricing subproblem with customer shadow prices, inject improving route columns, and finalize as an optimal integer fleet plan:

<CodeRunner>

```typescript
import { Model, expr, minimize, maximize, LinExpr } from "@ohtaman/washi";

async function runCVRP() {
  const vehicleCapacity = 8;
  const customers = [
    { id: "C1", demand: 4 },
    { id: "C2", demand: 3 },
    { id: "C3", demand: 5 },
    { id: "C4", demand: 2 },
    { id: "C5", demand: 4 },
  ];

  // 1. Build Restricted Master Problem (RMP)
  const master = new Model("CVRP_FleetMaster");

  // Initial naive routes: 1 dedicated vehicle per customer
  const initialRoutes = [];
  for (const cust of customers) {
    const r = master.binary(`route_init_${cust.id}`);
    initialRoutes.push(r);
  }

  // Objective: Minimize total fleet size
  master.objective(
    minimize(initialRoutes.reduce((acc, r) => acc.add(r), new LinExpr()))
  );

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
      // Pricing subproblem: Given dual prices of master visit constraints,
      // find a new feasible vehicle route visiting a subset of customers
      const sub = new Model("RoutePricing");

      const visitVars = {};
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

      const coefficients = {};
      const visited = [];
      for (const cust of customers) {
        if (Math.round(visitVars[cust.id].value ?? 0) === 1) {
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

1. **Natural Model Construction**: The master problem is defined just like a standard WaSHI model using `master.binary()` and `master.constraint()`. No dummy placeholders or low-level column definitions are required upfront.
2. **Transparent Pricing Callback**: The `pricing` function receives `getDual(constraintName)`, formulates the knapsack pricing problem, and returns the selected customers as `coefficients: { visit_C1: 1, ... }`.
3. **Decoupled Solution Metadata**: Through `meta: { visitedCustomers: visited }`, you can attach arbitrary domain objects (such as customer stop lists or GPS waypoints) and recover them directly from `result.generatedColumns` without parsing generated variable names.
