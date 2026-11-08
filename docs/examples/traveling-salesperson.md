# Traveling Salesperson Problem (TSP via Benders Decomposition)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Combinatorial OR / Benders | HiGHS (default) | `m.solveBenders()`, `subproblem`, `m.binary()`, `m.constraint()`, `expr` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts">Source Code</a></li><li><a href="../guide/decomposition.md">Decomposition Guide</a></li></ul> |

The **Traveling Salesperson Problem (TSP)** is the archetypal NP-hard combinatorial problem: find the shortest closed tour that visits every city in a given set exactly once and returns to the starting city.

Under the classical **Dantzig-Fulkerson-Johnson (DFJ)** formulation, preventing isolated mini-loops (called **subtours**) requires adding subtour elimination constraints for every non-empty proper subset of cities $S \subset V$:

$$\sum_{i \in S, j \notin S} x_{ij} \ge 1 \quad \forall S \subset V, \; 2 \le |S| \le |V| - 1$$

Because there are $2^n - 2$ possible subsets, adding all subtour elimination constraints upfront makes the model impossibly large even for 20 cities ($> 10^6$ constraints).

With **Benders Decomposition (Lazy Constraint Separation)**, we solve this efficiently:
1. **Master Problem**: Solves an initial lightweight degree-assignment relaxation (each city has 1 incoming and 1 outgoing edge).
2. **Benders Separation Subproblem**: Inspects the tentative tour from the master. If isolated subtours (disconnected cycles) exist, it dynamically generates and injects **Benders Feasibility Cuts** that break those specific subtours, iterating until a single connected grand tour is achieved.

## Problem Inputs

We have **5 benchmark cities** placed on a 2D Euclidean coordinate grid:

| City | Coordinates $(x, y)$ | Role |
| :--- | :---: | :--- |
| **City A (0)** | $(0, 0)$ | Origin / Depot |
| **City B (1)** | $(1, 0)$ | Southern stop |
| **City C (2)** | $(1, 2)$ | Eastern stop |
| **City D (3)** | $(0, 2)$ | Northern stop |
| **City E (4)** | $(0.5, 3)$ | Northern apex |

## Implementation in WaSHI

Click **▶ Run** below to solve the TSP interactively in your browser. Notice how WaSHI identifies the initial subtour `[A -> B -> A]`, injects a Benders feasibility cut, and converges in just 2 iterations:

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

      return null; // Feasible full tour found!
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

## Key Takeaways

1. **Lazy Constraint Generation**: You do not need to add $2^n$ subtour constraints upfront. The master problem starts with a minimal relaxation, and Benders cuts are added dynamically only when violated.
2. **Transparent Custom Separation Callback**: The `subproblem` callback reads candidate master values directly via `x[i][j].value`, analyzes the graph structure with a fast $O(V)$ cycle finder, and returns `{ kind: "feasibility", constraint: ... }`.
3. **Seamless Termination**: Once the subproblem returns `null`, WaSHI certifies that no violated subtours exist and the global tour is mathematically optimal.
