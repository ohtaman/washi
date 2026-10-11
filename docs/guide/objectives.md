# Objectives & Solving

The objective function defines the goal of the optimization—whether to maximize profits, minimize costs, or balance trade-offs.

---

## Setting the Objective Function

You can set the objective via `model.maximize(expression)` or `model.minimize(expression)`:

```typescript
import { Model, expr } from "@ohtaman/washi";

const model = new Model();
const x = model.addVar({ lb: 0 });
const y = model.addVar({ lb: 0 });

// Maximize revenue: 50*x + 40*y
model.maximize(expr`50 * ${x} + 40 * ${y}`);

// Or minimize cost:
// model.minimize(expr`10 * ${x} + 15 * ${y}`);
```

You can also specify the optimization direction upon `Model` construction:

```typescript
const model = new Model({ sense: "Maximize" }); // or "Minimize"
```

---

## 🚀 Solving the Model (`model.solve()`)

Optimization is executed asynchronously by calling `await model.solve()`:

```typescript
const result = await model.solve({
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

---

## 📊 Reading Results & Solver Status

After solving, query the status and solution properties:

```typescript
await model.solve();

// Solver Status
console.log("Status:", model.status);

// Optimal Objective Value
console.log("Objective Value:", model.objectiveValue);

// Individual Variable Values
console.log("x =", x.value);
console.log("y =", y.value);
```

### Possible Status Values

| Status | Meaning |
| :--- | :--- |
| `"Optimal"` | Global optimal solution found. |
| `"Infeasible"` | No solution exists that satisfies all constraints simultaneously. |
| `"Unbounded"` | The objective can increase/decrease indefinitely without violating constraints. |
| `"TimeLimit"` | The solver reached the specified time limit before proving optimality. |
| `"Error"` | Solver encountered an internal error. |
