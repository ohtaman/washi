# Traveling Salesperson Problem (TSP via Benders Decomposition)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Combinatorial OR / Benders | HiGHS (default) | `m.solveBenders()`, `subproblem`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts">Source Code</a></li><li><a href="../guide/decomposition.md">Decomposition Guide</a></li></ul> |

The **Traveling Salesperson Problem (TSP)** seeks the shortest closed tour that visits every city in a given set once and returns to the starting city.

In the **Dantzig-Fulkerson-Johnson (DFJ)** formulation, preventing disconnected cycles (**subtours**) requires subtour elimination constraints for every non-empty proper subset of cities $S \subset V$:

$$\sum_{i \in S, j \notin S} x_{ij} \ge 1 \quad \forall S \subset V, \; 2 \le |S| \le |V| - 1$$

Because there are $2^n - 2$ subsets, enumerating all subtour constraints upfront is impractical as $n$ grows. With **Benders Decomposition (Lazy Constraint Separation)**, constraints are added only when violated:
1. **Master Problem**: Solves the degree-assignment relaxation (each city has 1 incoming and 1 outgoing edge).
2. **Separation Subproblem**: Inspects the candidate solution graph. If disconnected cycles exist, it adds a **Benders Feasibility Cut** eliminating the smallest cycle and resolves until a single connected tour is obtained.

## Problem Inputs

We consider **5 cities** on a 2D Euclidean coordinate grid:

| City | Coordinates $(x, y)$ |
| :--- | :---: |
| **City A (0)** | $(0, 0)$ |
| **City B (1)** | $(1, 0)$ |
| **City C (2)** | $(1, 2)$ |
| **City D (3)** | $(0, 2)$ |
| **City E (4)** | $(0.5, 3)$ |

## Implementation in WaSHI

<CodeRunner>

```typescript
import { Model, expr, minimize, LinExpr } from "@ohtaman/washi";

async function runTSP() {
  const cities = [
    { name: "A", x: 0, y: 0 },
    { name: "B", x: 1, y: 0 },
    { name: "C", x: 1, y: 2 },
    { name: "D", x: 0, y: 2 },
    { name: "E", x: 0.5, y: 3 },
  ];
  const n = cities.length;

  function dist(i, j) {
    const dx = cities[i].x - cities[j].x;
    const dy = cities[i].y - cities[j].y;
    return Math.hypot(dx, dy);
  }

  // 1. Master Problem: Degree assignment relaxation
  const master = new Model("TSP_BendersMaster");
  const x = {};

  for (let i = 0; i < n; i++) {
    x[i] = {};
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        x[i][j] = master.binary(`x_${i}_${j}`);
      }
    }
  }

  // Objective: Minimize total tour distance
  let totalDistance = new LinExpr();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        totalDistance = totalDistance.add(x[i][j].mul(dist(i, j)));
      }
    }
  }
  master.objective(minimize(totalDistance));

  // Each city must have 1 outgoing and 1 incoming edge
  for (let i = 0; i < n; i++) {
    let outExpr = new LinExpr();
    let inExpr = new LinExpr();
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        outExpr = outExpr.add(x[i][j]);
        inExpr = inExpr.add(x[j][i]);
      }
    }
    master.constraint(expr`${outExpr} == 1`, `out_${i}`);
    master.constraint(expr`${inExpr} == 1`, `in_${i}`);
  }

  console.log("Solving TSP with Benders lazy subtour elimination...");

  // 2. Solve via Benders Decomposition
  let cutCounter = 0;
  const result = await master.solveBenders({
    subproblem: () => {
      // Find active directed edges in the master solution
      const succ = {};
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i !== j && Math.round(x[i][j].value ?? 0) === 1) {
            succ[i] = j;
          }
        }
      }

      // Trace connected cycles
      const visited = new Set();
      const cycles = [];
      for (let i = 0; i < n; i++) {
        if (!visited.has(i)) {
          const cycle = [];
          let curr = i;
          while (!visited.has(curr)) {
            visited.add(curr);
            cycle.push(curr);
            curr = succ[curr];
          }
          cycles.push(cycle);
        }
      }

      // If more than 1 cycle, subtours exist: inject Benders feasibility cut
      if (cycles.length > 1) {
        const smallestCycle = cycles.reduce((min, c) => (c.length < min.length ? c : min));
        const S = new Set(smallestCycle);
        cutCounter++;
        console.log(`Subtour detected: [${smallestCycle.map(k => cities[k].name).join(" -> ")}]. Adding Benders cut #${cutCounter}.`);

        let cutLhs = new LinExpr();
        for (const i of S) {
          for (let j = 0; j < n; j++) {
            if (!S.has(j)) {
              cutLhs = cutLhs.add(x[i][j]);
            }
          }
        }

        return {
          kind: "feasibility",
          constraint: expr`${cutLhs} >= 1`,
          name: `subtour_cut_${cutCounter}`,
        };
      }

      return null; // Single connected tour found
    },
  });

  console.log(`\nStatus: ${result.status}`);
  console.log(`Optimal Tour Distance: ${result.objectiveValue?.toFixed(3)}`);
  console.log(`Total Benders Cuts Added: ${result.cutsAdded}`);
  console.log(`Iterations: ${result.iterations}`);

  console.log("\nOptimal tour edges:");
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && (result.values[`x_${i}_${j}`] ?? 0) > 0.5) {
        console.log(`  ${cities[i].name} -> ${cities[j].name} (distance: ${dist(i, j).toFixed(3)})`);
      }
    }
  }
}

runTSP();
```

</CodeRunner>

## Notes

- **Lazy Subtour Elimination**: The master problem starts with only the $2n$ degree constraints, and subtour elimination cuts are added on demand when disconnected cycles appear in the master solution.
- **Separation Callback**: The `subproblem` callback reads candidate edge values via `x[i][j].value`, traces connected components in $O(n)$, and returns `{ kind: "feasibility", constraint: ... }` when multiple cycles are present.
- **Termination Condition**: Returning `null` from `subproblem` indicates that no violated subtour constraints remain.
