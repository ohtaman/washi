# 01: Production Planning (LP)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Linear / Integer Programming (LP / MIP) | HiGHS (default) | `m.addVar()`, `expr`, `c` | [Open in Playground](https://ohtaman.github.io/washi/demo/?preset=production) · [Source Code](https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts) |

Production planning is a classic Linear Programming problem: determine the optimal quantity of each product to manufacture in order to maximize total profit while respecting resource constraints (raw materials, machine time, labor hours).

---

## Mathematical Formulation

Let $x$ be the number of chairs and $y$ be the number of tables.

$$\begin{aligned}
\text{Maximize} \quad & 45x + 80y & (\text{Profit}) \\
\text{Subject to} \quad & 5x + 20y \le 400 & (\text{Mahogany Wood limit}) \\
& 10x + 15y \le 450 & (\text{Carpentry Labor limit}) \\
& x, y \ge 0, \quad x, y \in \mathbb{Z} & (\text{Integer Quantities})
\end{aligned}$$

---

## Implementation in WaSHI

```typescript
import { Model, expr, c } from "@ohtaman/washi";

async function runProductionOptimization() {
  const m = new Model("FactoryProduction");

  // Decision variables: Number of chairs and tables
  const chairs = m.addVar({ name: "chairs", lb: 0, type: "Integer" });
  const tables = m.addVar({ name: "tables", lb: 0, type: "Integer" });

  // Objective: Maximize profit ($45/chair, $80/table)
  m.maximize(expr`45 * ${chairs} + 80 * ${tables}`);

  // Resource Constraints
  m.addConstraint(c`5 * ${chairs} + 20 * ${tables} <= 400`, "mahogany_limit");
  m.addConstraint(c`10 * ${chairs} + 15 * ${tables} <= 450`, "labor_limit");

  // Solve with built-in HiGHS solver
  const status = await m.solve();

  console.log(`Status: ${status}`);
  console.log(`Optimal Profit: $${m.objectiveValue}`);
  console.log(`Chairs: ${chairs.value}`);
  console.log(`Tables: ${tables.value}`);
}

runProductionOptimization();
```

---

## Output

```text
Status: Optimal
Optimal Profit: $2050
Chairs: 24
Tables: 14
```
