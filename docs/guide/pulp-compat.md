# PuLP / python-mip Compatibility

For engineers and data scientists transitioning from Python, WaSHI includes a drop-in compatibility API inspired by **PuLP** and **python-mip**.

---

## Direct Comparison: Python PuLP vs. WaSHI

::: code-group

```python [Python (PuLP)]
import pulp

prob = pulp.LpProblem("Production", pulp.LpMaximize)

x = pulp.LpVariable("desks", lowBound=0, cat="Integer")
y = pulp.LpVariable("chairs", lowBound=0, cat="Integer")

prob += 30 * x + 50 * y, "Total_Profit"
prob += x + 2 * y <= 40, "Wood_Constraint"
prob += 2 * x + y <= 50, "Labor_Constraint"

prob.solve()
print(f"Status: {pulp.LpStatus[prob.status]}")
print(f"Profit: {pulp.value(prob.objective)}")
```

```typescript [TypeScript (WaSHI PuLP Style)]
import { LpProblem, LpMaximize, LpVariable, lpSum, c, expr } from "@ohtaman/washi";

const prob = new LpProblem("Production", LpMaximize);

const x = new LpVariable("desks", { lowBound: 0, cat: "Integer" });
const y = new LpVariable("chairs", { lowBound: 0, cat: "Integer" });

prob.setObjective(expr`30 * ${x} + 50 * ${y}`);
prob.addConstraint(c`${x} + 2 * ${y} <= 40`, "Wood_Constraint");
prob.addConstraint(c`2 * ${x} + ${y} <= 50`, "Labor_Constraint");

await prob.solve();
console.log(`Status: ${prob.status}`);
console.log(`Profit: ${prob.objectiveValue}`);
```

:::

---

## 🗂️ Compatible Classes & Enums

### `LpProblem`
- Construction: `new LpProblem(name, sense)`
- Senses: `LpMaximize`, `LpMinimize`
- Methods: `prob.addConstraint(c, name)`, `prob.setObjective(expr)`, `prob.solve()`

### `LpVariable`
- Options:
  - `lowBound`: numeric lower bound (default `0`)
  - `upBound`: numeric upper bound (default `Infinity`)
  - `cat`: `"Continuous"`, `"Integer"`, or `"Binary"`
- `LpVariable.matrix(name, [rows, cols], options)`: Creates 2D matrices of variables directly.

### `lpSum`
Sum an array of variables or expressions directly:

```typescript
import { lpSum } from "@ohtaman/washi";

const totalProduction = lpSum([x, y, z]);
```
