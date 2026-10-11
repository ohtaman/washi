# Constraints (`c`)

Constraints restrict the feasible solution space of your mathematical model.

In WaSHI, constraints are formulated using the **`c` tagged template literal** or programmatic constraint builders.

---

## ✍️ Tagged Template Literals (`c`)

The `c` tag allows you to write algebraic equations and inequalities intuitively:

```typescript
import { Model, c } from "@ohtaman/washi";

const model = new Model();
const x = model.addVar({ lb: 0 });
const y = model.addVar({ lb: 0 });

// Less than or equal to (<=)
model.addConstraint(c`${x} + 2 * ${y} <= 40`, "wood_limit");

// Greater than or equal to (>=)
model.addConstraint(c`3 * ${x} + ${y} >= 20`, "min_demand");

// Equality (== or =)
model.addConstraint(c`${x} + ${y} == 30`, "exact_quota");
```

### Supported Comparison Operators
- `<=`: Upper bound constraint
- `>=`: Lower bound constraint
- `==` or `=`: Exact equality constraint

---

## 🏷️ Naming Constraints

It is strongly recommended to give meaningful names to constraints (the second argument of `model.addConstraint`):

```typescript
model.addConstraint(c`${x} + ${y} <= 100`, "budget_cap");
```

### Why Name Constraints?
1. **Model Debugging**: Exporting the model as LP/MPS format will use these human-readable names.
2. **Conflict Diagnosis (`unsatCore`)**: When a problem is infeasible, WaSHI returns the exact constraint names responsible for the contradiction.

---

## 🔁 Adding Constraints in Loops

When modeling structured problems like knapsack capacities, staffing, or graph flows:

```typescript
// For each time period t, demand must be met
const demands = [100, 150, 200, 120];
const production = demands.map((_, t) => model.addVar({ lb: 0, name: `prod_${t}` }));

for (let t = 0; t < demands.length; t++) {
  model.addConstraint(c`${production[t]} >= ${demands[t]}`, `demand_met_${t}`);
}
```

---

## 📐 Dual Values & Shadows Prices (LP)

For continuous Linear Programming (LP) problems solved with HiGHS or GLPK, you can query shadow prices (dual values) to analyze economic marginal costs:

```typescript
const constraint = model.addConstraint(c`${x} + 2 * ${y} <= 40`, "resource");

await model.solve();

console.log("Shadow price (dual):", constraint.dual);
```
