# Constraints (`m.constraint` & `m.indicator`)

Constraints restrict the feasible solution space of your mathematical or logical model.
In WaSHI, both linear arithmetic constraints and propositional SMT formulas are registered using **`m.constraint()`**:

```typescript
m.constraint(expr`${desks} + 2 * ${chairs} <= 40`, "wood_limit");
```

---

## ✍️ Algebraic Linear Constraints (`expr`)

The `expr` tagged template literal syntax allows writing equations and inequalities with natural mathematical notation:

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

### Batch Registration
You can pass an array of constraints to `m.constraint([...])` to register them transactionally in a single call:

```typescript
m.constraint([expr`${x} <= 10`, expr`${y} <= 20`]);
```

---

## 🏷️ Naming Constraints

Every constraint can be given a unique, descriptive name as the second argument of `m.constraint(c, name)`:

```typescript
m.constraint(expr`${x} + ${y} <= 100`, "budget_cap");
```

### Why Name Constraints?
1. **Model Inspection (`m.toLpString()`)**: Exported CPLEX LP strings retain these descriptive names (sanitized if needed) so you can inspect the exact generated formulation.
2. **Conflict Diagnosis (`conflicts` / `unsatCore`)**: When constraints contradict each other, Z3 `m.check()` returns the exact constraint names forming the conflicting subset.
3. **Direct Lookup (`m.getConstraintByName()`)**: Retrieve a constraint by name after solving to inspect its `dual` or `slack` value.

---

## 🔁 Adding Constraints over Iterables & Sums

Use `sum()` or `dot()` inside `expr` to express linear aggregations cleanly:

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

When a linear constraint should only take effect when a binary decision variable is active (`1` or `0`), use `m.indicator()`:

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
- For `<=` constraints, variables with positive coefficients require finite upper bounds (`ub`), and negative coefficients require finite lower bounds (`lb`).
- For `>=` constraints, variables with positive coefficients require finite lower bounds (`lb`), and negative coefficients require finite upper bounds (`ub`).
- For `==` constraints, safe bounds are derived separately for both the `<=` and `>=` directions (generating `name_le` and `name_ge`).

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
> By setting explicit, realistic variable bounds (`lb` and `ub`), WaSHI derives the tightest possible safe Big-M automatically.

---

## 🧠 Propositional Logic & SMT Constraints (`BoolVar`, `and`, `or`, `not`, `implies`, `xor`)

When solving with the **Z3** SMT engine (`@ohtaman/washi/solvers/z3`), you can combine propositional boolean variables (`m.bool()`) and linear constraints (`Constraint`) using first-class logical operators:

```typescript
import { Model, expr, and, or, not, implies, xor } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ solver: "z3" });
const isAdmin = m.bool("isAdmin");
const hasMfa = m.bool("hasMfa");
const Clearance = m.integer("clearance", { lb: 0, ub: 5 });

// Method syntax on BoolVar / BoolOp:
m.constraint(isAdmin.implies(hasMfa), "admin_requires_mfa");

// Mixing boolean propositions with linear arithmetic comparisons:
m.constraint(
  implies(isAdmin, expr`${Clearance} >= 4`),
  "admin_clearance_level"
);

// Top-level helper functions (and, or, not, implies, xor):
m.constraint(and(or(isAdmin, hasMfa), not(xor(isAdmin, hasMfa))), "policy");
```

### Choosing Between `m.indicator()` and `implies()`

| Feature | `m.indicator(binVar, constraint, opts)` | `implies(a, b)` / `a.implies(b)` |
| :--- | :--- | :--- |
| **Trigger variable** | Numeric `Binary` variable (`m.binary()`) | `BoolVar` (`m.bool()`), `BoolOp`, or `Constraint` |
| **Consequent** | Linear `Constraint` (`<=`, `>=`, `==`) | `BoolVar`, `BoolOp`, or linear `Constraint` |
| **Target Solvers** | **All MIP/LP solvers** (HiGHS, GLPK, Z3) via Big-M linearization | **Z3 SMT solver** (`capabilities.supportsSMT: true`) |
| **Best For** | Operations research & MIP optimization with an objective (`m.solve()`) | Rule engines, policy verification, and SMT feasibility (`m.check()`) |

---

## 📐 Dual Values, Shadow Prices & Lookups

For continuous Linear Programming (LP) problems, query the economic shadow price (`dual`) and surplus (`slack`) on each constraint:

```typescript
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood");

await m.solve();

const woodConstraint = m.getConstraintByName("wood");
console.log("Shadow price (dual):", woodConstraint?.dual);
console.log("Slack surplus:", woodConstraint?.slack);
console.log("Total linear constraints:", m.numConstrs);
```

For logical constraints registered with a name, use `m.getLogicalConstraintByName(name)` to look up the registered `LogicalConstraintItem`.
