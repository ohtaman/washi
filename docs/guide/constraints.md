# Constraints (`m.constraint`)

Constraints restrict the feasible solution space of your mathematical model.
In WaSHI, constraints are formulated using the declarative method **`m.constraint()`** combined with the tagged template literal **`c`**:

```typescript
m.constraint(c`${desks} + 2 * ${chairs} <= 40`, "wood_limit");
```

---

## ✍️ Intuitive Algebraic Constraints (`c`)

The `c` tagged template literal syntax allows writing equations and inequalities with natural mathematical expressions:

```typescript
import { Model, c } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// Upper bound inequality (<=)
m.constraint(c`${x} + 2 * ${y} <= 40`, "wood_limit");

// Lower bound inequality (>=)
m.constraint(c`3 * ${x} + ${y} >= 20`, "min_demand");

// Exact equality (==)
m.constraint(c`${x} + ${y} == 30`, "exact_quota");
```

### Supported Comparison Operators
- `<=`: Upper bound constraint
- `>=`: Lower bound constraint
- `==` or `=`: Exact equality constraint

---

## 🏷️ Naming Constraints

Every constraint can be provided with a descriptive name (the second argument of `m.constraint`):

```typescript
m.constraint(c`${x} + ${y} <= 100`, "budget_cap");
```

### Why Name Constraints?
1. **Model Debugging**: Exported LP and MPS files retain these descriptive names.
2. **Conflict Diagnosis (`conflicts` / `unsatCore`)**: When constraints contradict each other, WaSHI returns the exact constraint names forming the conflicting subset.

---

## 🔁 Adding Constraints over Iterables & Sums

Use `sum()` inside `c` to express linear aggregations cleanly:

```typescript
import { Model, c, sum } from "@ohtaman/washi";

const items = ["A", "B", "C"];
const weights = { A: 5, B: 10, C: 15 };
const selected = m.binary(items);

// Total weight cannot exceed capacity 25
m.constraint(
  c`${sum(items, (i) => selected[i].mul(weights[i]))} <= 25`,
  "capacity_limit"
);
```

---

## 🎯 Conditional / Indicator Constraints (`m.indicator`)

When a constraint should only take effect when a binary decision variable is active (value $= 1$):

```typescript
const useDiscount = m.binary("use_discount");

// If useDiscount == 1, then cartTotal >= 100
m.indicator(useDiscount, c`${cartTotal} >= 100`, {
  activeValue: 1,
  M: 1000,
  name: "min_spend_for_discount",
});
```

---

## 📐 Dual Values & Shadow Prices (LP)

For continuous Linear Programming (LP) problems, query the economic shadow price (`dual`) and surplus (`slack`):

```typescript
m.constraint(c`${x} + 2 * ${y} <= 40`, "wood");

await m.solve();

const woodConstraint = m.getConstraintByName("wood");
console.log("Shadow price (dual):", woodConstraint?.dual);
console.log("Slack surplus:", woodConstraint?.slack);
```
