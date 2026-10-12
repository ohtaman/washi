# Constraints (`m.constrain`)

Constraints restrict the feasible solution space of your mathematical model.
In WaSHI, constraints are formulated using the primary method **`m.constrain()`** combined with tagged template literal formulas (`expr`):

```typescript
m.constrain(expr`${desks} + 2 * ${chairs} <= 40`, "wood_limit");
```

---

## ✍️ Intuitive Algebraic Constraints (`expr`)

The tagged template literal syntax allows writing equations and inequalities with natural mathematical expressions:

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// Upper bound inequality (<=)
m.constrain(expr`${x} + 2 * ${y} <= 40`, "wood_limit");

// Lower bound inequality (>=)
m.constrain(expr`3 * ${x} + ${y} >= 20`, "min_demand");

// Exact equality (==)
m.constrain(expr`${x} + ${y} == 30`, "exact_quota");
```

### Supported Comparison Operators
- `<=`: Upper bound constraint
- `>=`: Lower bound constraint
- `==` or `=`: Exact equality constraint

---

## 🏷️ Naming Constraints

Every constraint should be provided with a descriptive name (the second argument of `m.constrain`):

```typescript
m.constrain(expr`${x} + ${y} <= 100`, "budget_cap");
```

### Why Name Constraints?
1. **Model Debugging**: Exported LP and MPS files retain these descriptive names.
2. **Conflict Diagnosis (`unsatCore`)**: When constraints contradict each other, WaSHI returns the exact constraint names forming the conflicting subset.

---

## 🔁 Adding Constraints over Iterables & Sums

Use `sum()` inside `expr` to express linear aggregations cleanly:

```typescript
import { Model, expr, sum } from "@ohtaman/washi";

const items = ["A", "B", "C"];
const weights = { A: 5, B: 10, C: 15 };
const selected = m.binary(items);

// Total weight cannot exceed capacity 25
m.constrain(
  expr`${sum(items, (i) => selected[i].mul(weights[i]))} <= 25`,
  "capacity_limit"
);
```

---

## 🎯 Conditional / Indicator Constraints (`m.indicator`)

When a constraint should only take effect when a binary decision variable is active (value $= 1$):

```typescript
const useDiscount = m.binary("use_discount");

// If useDiscount == 1, then cartTotal >= 100
m.indicator(useDiscount, expr`${cartTotal} >= 100`, {
  activeValue: 1,
  M: 1000,
  name: "min_spend_for_discount",
});
```

---

## 📐 Dual Values & Shadow Prices (LP)

For continuous Linear Programming (LP) problems, query the economic shadow price (`dual`) and surplus (`slack`):

```typescript
const woodConstraint = m.constrain(expr`${x} + 2 * ${y} <= 40`, "wood");

await m.optimize();

console.log("Shadow price (dual):", woodConstraint.dual);
console.log("Slack surplus:", woodConstraint.slack);
```
