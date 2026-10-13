# 0-1 Knapsack Problem (Binary MIP)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| 0-1 Binary MIP | HiGHS (default) | `m.binary()`, `m.constraint()`, `c`, `maximize`, `dot` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=knapsack">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts">Source Code</a></li></ul> |

The 0-1 Knapsack problem is an essential combinatorial optimization problem: given a set of items, each with a weight and a value, determine which items to include in a collection so that the total weight does not exceed a given limit and the total value is maximized.

## Mathematical Formulation

Let $x_i \in \{0, 1\}$ be binary decision variables indicating whether item $i$ is selected ($x_i = 1$) or not ($x_i = 0$):

$$\begin{aligned}
\text{Maximize} \quad & \sum_{i} v_i x_i & (\text{Total Value}) \\
\text{Subject to} \quad & \sum_{i} w_i x_i \le W & (\text{Weight Capacity}) \\
& x_i \in \{0, 1\} & (\text{Binary Decisions})
\end{aligned}$$

## Implementation in WaSHI

<CodeRunner preset="knapsack">

```typescript
import { Model, c, maximize, dot } from "@ohtaman/washi";

async function solveKnapsack() {
  const m = new Model("Knapsack");

  const items = [
    { name: "Laptop",   weight: 3, value: 50 },
    { name: "Camera",   weight: 2, value: 40 },
    { name: "Drone",    weight: 4, value: 65 },
    { name: "FirstAid", weight: 1, value: 15 },
    { name: "Tent",     weight: 5, value: 70 },
  ];
  const maxCapacity = 7; // kg

  // Create binary variables: x[name] (0 or 1)
  const x = m.binary(items.map((it) => it.name));

  const values = Object.fromEntries(items.map((it) => [it.name, it.value]));
  const weights = Object.fromEntries(items.map((it) => [it.name, it.weight]));

  // Maximize total value via dot product
  m.objective(maximize(dot(values, x)));

  // Weight capacity constraint using natural c and constraint() syntax
  m.constraint(c`${dot(weights, x)} <= ${maxCapacity}`, "capacity_limit");

  const status = await m.solve();

  console.log(`Status: ${status}`);
  console.log(`Max Total Value: $${m.objectiveValue}`);
  console.log("Selected Items:", m.getValues(x));
}

solveKnapsack();
```

</CodeRunner>
