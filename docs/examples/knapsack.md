# 0-1 Knapsack Problem (Binary MIP)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| 0-1 Binary MIP | HiGHS (default) | `m.addVars(keys)`, `type: "Binary"`, `sum()` | [Open in Playground](https://ohtaman.github.io/washi/demo/?preset=knapsack) · [Source Code](https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts) |

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
import { Model, sum } from "@ohtaman/washi";

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

  // Create binary variables: x[name] = 1 (selected) or 0 (not selected)
  const x = m.addVars(items.map((it) => it.name), { type: "Binary" });

  // Maximize total value
  m.maximize(sum(items, (it) => x[it.name].mul(it.value)));

  // Total weight constraint
  m.addConstraint(
    sum(items, (it) => x[it.name].mul(it.weight)).le(maxCapacity),
    "capacity_limit"
  );

  const status = await m.solve();

  console.log(`Status: ${status}`);
  console.log(`Max Total Value: $${m.objectiveValue}`);
  console.log("Selected Items:");
  for (const it of items) {
    if (Math.round(x[it.name].value ?? 0) === 1) {
      console.log(`  - ${it.name} (${it.weight}kg, $${it.value})`);
    }
  }
}

solveKnapsack();
```

</CodeRunner>
