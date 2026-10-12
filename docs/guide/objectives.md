# Objectives & Solving (`m.optimize`)

The objective function defines the goal of mathematical optimization—whether to maximize profits, minimize costs, or minimize quadratic risk variance.

---

## Setting the Objective Function

Set the objective direction and formula using `m.maximize(expression)` or `m.minimize(expression)`:

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model("ProductionRevenue");
const x = m.integer("x", { lb: 0 });
const y = m.integer("y", { lb: 0 });

// Maximize revenue: 50*x + 40*y
m.maximize(expr`50 * ${x} + 40 * ${y}`);

// Or minimize cost:
// m.minimize(expr`10 * ${x} + 15 * ${y}`);
```

---

## 🚀 Solving the Model (`m.optimize()`)

Optimization is executed asynchronously by calling `await m.optimize()`:

```typescript
const status = await m.optimize({
  timeLimit: 10.0, // Timeout in seconds
  verbose: false,  // Enable/disable solver console logging
});
```

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
const status = await m.optimize();

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
