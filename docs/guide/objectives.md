# Objectives & Solving (`m.solve`)

The objective function defines the goal of mathematical optimization—whether to maximize profits, minimize costs, or minimize quadratic risk variance.

---

## Setting the Objective Function

Set the objective direction and formula declaratively using `m.objective(maximize(...))` or `m.objective(minimize(...))`:

```typescript
import { Model, expr, maximize, minimize } from "@ohtaman/washi";

const m = new Model("ProductionRevenue");
const x = m.integer("x", { lb: 0 });
const y = m.integer("y", { lb: 0 });

// Maximize revenue: 50*x + 40*y
m.objective(maximize(expr`50 * ${x} + 40 * ${y}`));

// Or minimize cost:
// m.objective(minimize(expr`10 * ${x} + 15 * ${y}`));
```

> [!TIP]
> `m.maximize(expr)` and `m.minimize(expr)` remain available as backward-compatible convenience methods on `Model`.

---

## 🚀 Solving the Model (`m.solve()`)

Optimization is executed asynchronously by calling `await m.solve()`:

```typescript
const status = await m.solve({
  timeLimit: 10.0, // Timeout in seconds
  verbose: false,  // Enable/disable solver console logging
});
```

> [!NOTE]
> `m.optimize(options?)` is preserved as a direct pass-through alias to `m.solve(options?)`.

### Solve Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `timeLimit` | `number` | `undefined` | Maximum solve time limit in seconds. |
| `verbose` | `boolean` | `false` | When `true`, prints internal solver iteration logs. |
| `mipGap` | `number` | `undefined` | Relative optimality gap tolerance for MIP (e.g. `0.01` for 1%). |
| `solver` | `"highs"` \| `"z3"` \| `"glpk"` \| `string` | `"highs"` | Target solver plugin to use for this execution. |

---

## 📊 Reading Results & Solver Status

After solving, query the status and optimal values:

```typescript
const status = await m.solve();

// Solver Status ("Optimal", "Infeasible", "Unbounded", "TimeLimit")
console.log("Status:", status);

// Optimal Objective Value
console.log("Objective Value:", m.objectiveValue);

// Individual Variable Values
console.log("x =", x.value);
console.log("y =", y.value);

// Bulk Variable Values
const values = m.getValues({ x, y });
console.log(values); // { x: ..., y: ... }
```

### Possible Status Values

| Status | Meaning |
| :--- | :--- |
| `"Optimal"` | Global optimal solution found. |
| `"Infeasible"` | No solution exists that satisfies all constraints simultaneously. |
| `"Unbounded"` | The objective can increase/decrease indefinitely without violating constraints. |
| `"TimeLimit"` | The solver reached the specified time limit before proving optimality. |
| `"Error"` | Solver encountered an internal error. |

---

## 🔄 Model Mutations & Execution Validity

A `Model` instance keeps its solution state synchronized across mutations made through `Model` methods and `Model` / `Var` / `Constraint` property setters:

1. **Post-Solve Mutations Reset Solution State**: Adding variables or constraints, updating the objective (`m.objective(...)`, `m.setObjective(...)`, `m.objectiveExpr = ...`, `m.sense = ...`), or modifying variable bounds/types (`v.lb`, `v.ub`, `v.type`) or constraint properties (`c.lhs`, `c.sense`, `c.rhs`, `c.name`) immediately resets `m.status` to `"NotSolved"`, clears `m.solution` and `m.objectiveValue`, and resets variable/constraint primal and dual values to `null`.
2. **Mid-Flight Mutations Discard Stale Runs**: If the model is modified via these APIs while an asynchronous `m.solve()` or `m.check()` call is in progress, the stale solver result is discarded, the model remains in `"NotSolved"`, and the in-flight promise rejects with an explicit error.
3. **Overlapping Executions**: Starting a new `m.solve()` or `m.check()` call supersedes any earlier in-flight call on the same model so out-of-order completions can never overwrite the latest run's state.
4. **Transactional Batch Edits**: If an invalid edit is rejected (including batch array calls like `m.constraint([...])`), the model rolls back the failed edit without leaving partial entities registered or invalidating an existing valid solution.

