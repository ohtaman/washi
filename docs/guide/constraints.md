# Constraints (`m.constraint`)

Constraints restrict the feasible solution space of your mathematical model.
In WaSHI, constraints are formulated using the declarative method **`m.constraint()`** combined with the tagged template literal **`expr`**:

```typescript
m.constraint(expr`${desks} + 2 * ${chairs} <= 40`, "wood_limit");
```

---

## ✍️ Intuitive Algebraic Constraints (`expr`)

The `expr` tagged template literal syntax allows writing equations and inequalities with natural mathematical expressions:

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// Upper bound inequality (<=)
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_limit");

// Lower bound inequality (>=)
m.constraint(expr`3 * ${x} + ${y} >= 20`, "min_demand");

// Exact equality (==)
m.constraint(expr`${x} + ${y} == 30`, "exact_quota");
```

### Supported Comparison Operators
- `<=`: Upper bound constraint
- `>=`: Lower bound constraint
- `==` or `=`: Exact equality constraint

---

## 🏷️ Naming Constraints

Every constraint can be provided with a descriptive name (the second argument of `m.constraint`):

```typescript
m.constraint(expr`${x} + ${y} <= 100`, "budget_cap");
```

### Why Name Constraints?
1. **Model Debugging**: Exported LP and MPS files retain these descriptive names.
2. **Conflict Diagnosis (`conflicts` / `unsatCore`)**: When constraints contradict each other, WaSHI returns the exact constraint names forming the conflicting subset.

---

## 🔁 Adding Constraints over Iterables & Sums

Use `sum()` inside `expr` to express linear aggregations cleanly:

```typescript
import { Model, sum, expr } from "@ohtaman/washi";

const items = ["A", "B", "C"];
const weights = { A: 5, B: 10, C: 15 };
const selected = m.binary(items);

// Total weight cannot exceed capacity 25
m.constraint(
  expr`${sum(items, (i) => selected[i].mul(weights[i]))} <= 25`,
  "capacity_limit"
);
```

---

## 🎯 Conditional / Indicator Constraints (`m.indicator`)

When a constraint should only take effect when a binary decision variable is active (e.g. value $= 1$ or $0$):

```typescript
const useDiscount = m.binary("use_discount");
const cartTotal = m.continuous("cart_total", { lb: 0, ub: 10_000 });

// If useDiscount == 1, then cartTotal >= 100
// WaSHI automatically derives a safe, tight Big-M from the variable bounds
m.indicator(useDiscount, expr`${cartTotal} >= 100`, {
  activeValue: 1,
  name: "min_spend_for_discount",
});
```

### Safe Automatic Big-M Derivation & Bounds

When `options.M` is omitted, WaSHI automatically derives a safe, minimal Big-M value from the finite variable bounds:
- For `<="` constraints, variables with positive coefficients require finite upper bounds (`ub`), and negative coefficients require finite lower bounds (`lb`).
- For `>="` constraints, variables with positive coefficients require finite lower bounds (`lb`), and negative coefficients require finite upper bounds (`ub`).
- For `=="` constraints, safe bounds are derived separately for both the `<="` and `>="` directions.

If any referenced variable lacks the required finite bounds, `m.indicator()` throws an actionable error prompting for finite bounds or an explicit `options.M`.

### Explicit Override & Numerical Stability

You can override the derived Big-M by providing `{ M: number }`:

```typescript
m.indicator(useDiscount, expr`${cartTotal} >= 100`, {
  activeValue: 1,
  M: 10_000, // Explicit override
});
```

> [!TIP]
> **Numerical Stability vs. Correctness**:
> An $M$ value that is too small can inadvertently cut off valid solutions. Conversely, an excessively large $M$ (e.g., $10^9$) causes poor matrix conditioning and numerical instability in MIP solvers.
> By setting explicit, realistic variable bounds (`lb` and `ub`), WaSHI will derive the tightest possible safe Big-M automatically.


---

## 📐 Dual Values & Shadow Prices (LP)

For continuous Linear Programming (LP) problems, query the economic shadow price (`dual`) and surplus (`slack`):

```typescript
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood");

await m.solve();

const woodConstraint = m.getConstraintByName("wood");
console.log("Shadow price (dual):", woodConstraint?.dual);
console.log("Slack surplus:", woodConstraint?.slack);
```
