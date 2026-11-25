# 0-1 Knapsack Problem (Binary MIP)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| 0-1 Binary MIP | HiGHS (default) | `m.binary()`, `m.constraint()`, `expr` (`dot`), `maximize` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=knapsack">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts">Source Code</a></li></ul> |

The 0-1 Knapsack problem is a fundamental combinatorial optimization problem. Given items with weights and values, choose a subset that maximizes total value without exceeding the backpack's weight limit.

## Mathematical Formulation

Let $v_i$ and $w_i$ be the value and weight of item $i$, $W$ be the weight capacity, and $x_i \in \{0, 1\}$ be a binary decision variable where $x_i = 1$ selects the item and $x_i = 0$ leaves it out:

$$\begin{aligned}
\text{Maximize} \quad & \sum_{i} v_i x_i & (\text{Total Value}) \\
\text{Subject to} \quad & \sum_{i} w_i x_i \le W & (\text{Weight Capacity}) \\
& x_i \in \{0, 1\} \quad \forall i & (\text{Binary Decisions})
\end{aligned}$$

## Implementation in WaSHI

<CodeRunner preset="knapsack">

```typescript
import { Model, maximize, expr } from "@ohtaman/washi";

async function solveKnapsack() {
  const m = new Model("Knapsack");

  // weight in kg, value in $
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

  // Objective: Maximize total value
  m.objective(maximize(expr`dot(${values}, ${x})`));

  // Weight capacity constraint
  m.constraint(expr`dot(${weights}, ${x}) <= ${maxCapacity}`, "capacity_limit");

  const status = await m.solve();

  console.log(`Status: ${status}`);
  console.log(`Max Total Value: $${m.objectiveValue}`);
  const packed = items.filter((it) => x[it.name].value === 1).map((it) => it.name);
  console.log("Packed Items:", packed.join(", "));
}

solveKnapsack();
```

</CodeRunner>

## Key Takeaways

- **Optimal Result**: Packing `Camera` (`2 kg`, `$40`), `Drone` (`4 kg`, `$65`), and `FirstAid` (`1 kg`, `$15`) reaches the exact `7 kg` capacity with a maximum value of `$120`.
- **Concise Modeling with `m.binary(names)` and `dot()`**: Passing item names to `m.binary()` creates a keyed dictionary of 0-1 variables in one call. Pairing that dictionary with `dot()` inside `expr` computes weighted sums directly without manual loops.
