# Production Planning (LP / MIP)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Integer Programming (MIP) | HiGHS (default) | `m.integer()`, `m.constraint()`, `expr`, `maximize` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=production">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts">Source Code</a></li></ul> |

Production planning is a classic optimization problem. You choose how many units of each product to make to maximize profit without exceeding resource limits such as raw materials or labor hours.

## Mathematical Formulation

Let $x$ be the number of chairs (profit `$45` each) and $y$ be the number of tables (profit `$80` each).

$$\begin{aligned}
\text{Maximize} \quad & 45x + 80y & (\text{Profit}) \\
\text{Subject to} \quad & 5x + 20y \le 400 & (\text{Mahogany Wood limit}) \\
& 10x + 15y \le 450 & (\text{Carpentry Labor limit}) \\
& x, y \ge 0, \quad x, y \in \mathbb{Z} & (\text{Integer Quantities})
\end{aligned}$$

## Implementation in WaSHI

<CodeRunner preset="production">

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

async function runProductionOptimization() {
  const m = new Model("FactoryProduction");

  // Decision variables: non-negative integer quantities
  const chairs = m.integer("chairs", { lb: 0 });
  const tables = m.integer("tables", { lb: 0 });

  // Objective: Maximize total profit ($45 per chair, $80 per table)
  m.objective(maximize(expr`45 * ${chairs} + 80 * ${tables}`));

  // Resource constraints: mahogany wood and carpentry labor limits
  m.constraint(expr`5 * ${chairs} + 20 * ${tables} <= 400`, "mahogany_limit");
  m.constraint(expr`10 * ${chairs} + 15 * ${tables} <= 450`, "labor_limit");

  const status = await m.solve();

  console.log(`Status: ${status}`);
  console.log(`Optimal Profit: $${m.objectiveValue}`);
  console.log(`Chairs: ${chairs.value}, Tables: ${tables.value}`);
}

runProductionOptimization();
```

</CodeRunner>

## Key Takeaways

- **Optimal Result**: Producing `chairs = 24` and `tables = 14` yields the maximum profit of `$2,200`. Both resources are fully used: mahogany wood is $5(24) + 20(14) = 400$ and carpentry labor is $10(24) + 15(14) = 450$.
- **Why `m.integer()` instead of `m.continuous()`**: Chairs and tables are discrete items that cannot be shipped in fractions. Although this instance happens to have an integer LP optimum, `m.integer()` guarantees whole-number outputs even when limits or prices change.
