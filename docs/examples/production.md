# Production Planning (LP / MIP)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Linear / Integer Programming (LP / MIP) | HiGHS (default) | `m.integer()`, `m.constrain()`, `expr` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=production">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts">Source Code</a></li></ul> |

Production planning is a classic Linear Programming problem: determine the optimal quantity of each product to manufacture in order to maximize total profit while respecting resource constraints (raw materials, machine time, labor hours).

## Mathematical Formulation

Let $x$ be the number of chairs and $y$ be the number of tables.

$$\begin{aligned}
\text{Maximize} \quad & 45x + 80y & (\text{Profit}) \\
\text{Subject to} \quad & 5x + 20y \le 400 & (\text{Mahogany Wood limit}) \\
& 10x + 15y \le 450 & (\text{Carpentry Labor limit}) \\
& x, y \ge 0, \quad x, y \in \mathbb{Z} & (\text{Integer Quantities})
\end{aligned}$$

## Implementation in WaSHI

<CodeRunner preset="production">

```typescript
import { Model, expr } from "@ohtaman/washi";

async function runProductionOptimization() {
  const m = new Model("FactoryProduction");

  // Decision variables: non-negative integer quantities
  const chairs = m.integer("chairs", { lb: 0 });
  const tables = m.integer("tables", { lb: 0 });

  // Objective: Maximize total profit ($45 per chair, $80 per table)
  m.maximize(expr`45 * ${chairs} + 80 * ${tables}`);

  // Resource constraints: declarative formulas via expr and fluent constrain()
  m.constrain(expr`5 * ${chairs} + 20 * ${tables} <= 400`, "mahogany_limit")
   .constrain(expr`10 * ${chairs} + 15 * ${tables} <= 450`, "labor_limit");

  const status = await m.optimize();

  console.log(`Status: ${status}`);
  console.log(`Optimal Profit: $${m.objectiveValue}`);
  console.log(`Chairs: ${chairs.value}, Tables: ${tables.value}`);
}

runProductionOptimization();
```

</CodeRunner>
