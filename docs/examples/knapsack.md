# 02: Knapsack Problem (MIP)

The 0-1 Knapsack problem is an essential combinatorial optimization problem: given a set of items, each with a weight and a value, determine which items to include in a collection so that the total weight does not exceed a given limit and the total value is maximized.

---

## Mathematical Formulation

Let $x_i \in \{0, 1\}$ be binary decision variables indicating whether item $i$ is selected ($x_i = 1$) or not ($x_i = 0$):

$$\begin{aligned}
\text{Maximize} \quad & \sum_{i} v_i x_i & (\text{Total Value}) \\
\text{Subject to} \quad & \sum_{i} w_i x_i \le W & (\text{Weight Capacity}) \\
& x_i \in \{0, 1\} & (\text{Binary Decisions})
\end{aligned}$$

---

## Implementation in WaSHI

```typescript
import { Model, quicksum } from "@ohtaman/washi";

interface Item {
  name: string;
  weight: number;
  value: number;
}

async function solveKnapsack() {
  const model = new Model("Knapsack");

  const items: Item[] = [
    { name: "Laptop", weight: 3, value: 50 },
    { name: "Camera", weight: 2, value: 40 },
    { name: "Drone", weight: 4, value: 65 },
    { name: "FirstAid", weight: 1, value: 15 },
    { name: "Tent", weight: 5, value: 70 },
  ];
  const maxCapacity = 7; // kg

  // Create binary variables for each item
  const x = items.map((item) =>
    model.addVar({ type: "Binary", name: item.name })
  );

  // Maximize total value
  model.maximize(quicksum(x.map((varItem, i) => [items[i].value, varItem])));

  // Total weight constraint: sum(w_i * x_i) <= maxCapacity
  const totalWeight = quicksum(x.map((varItem, i) => [items[i].weight, varItem]));
  model.addConstraint(totalWeight.le(maxCapacity), "capacity_limit");

  const status = await model.solve();

  console.log(`Status: ${status}`);
  console.log(`Max Total Value: $${model.objectiveValue}`);
  console.log("Selected Items:");

  items.forEach((item, i) => {
    if (x[i].value === 1) {
      console.log(`  - ${item.name} (${item.weight}kg, $${item.value})`);
    }
  });
}

solveKnapsack();
```

---

## Output

```text
Status: Optimal
Max Total Value: $120
Selected Items:
  - Laptop (3kg, $50)
  - Drone (4kg, $65)
```
