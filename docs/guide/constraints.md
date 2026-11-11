# Constraints (`m.constraint` & `m.indicator`)

Constraints restrict the feasible solution space of your mathematical or logical model.
In WaSHI, both linear arithmetic constraints and propositional logic formulas are registered using **`m.constraint()`**:

```typescript
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_limit");
```

---

## Algebraic Linear Constraints (`expr`)

The `expr` tagged template literal allows writing equations and inequalities with standard mathematical notation:

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

`m.constraint()` returns the registered `Constraint` (or `BoolExpr` for logical formulas), or an array when passed a batch array.

### Supported Comparison Operators
- `<=`: Upper bound constraint
- `>=`: Lower bound constraint
- `==` or `=`: Exact equality constraint

### Batch Registration
Pass an array of constraints to `m.constraint([...])` to register them transactionally in a single call:

```typescript
m.constraint([expr`${x} <= 10`, expr`${y} <= 20`]);
```

---

## Naming Constraints

Pass a unique, descriptive name as the second argument of `m.constraint(c, name)`:

```typescript
m.constraint(expr`${x} + ${y} <= 100`, "budget_cap");
```

### Why Name Constraints?
1. **Model Inspection (`m.toLpString()`)**: Exported CPLEX LP strings retain these descriptive names (sanitized if needed) so you can inspect the generated formulation.
2. **Conflict Diagnosis (`conflicts` / `unsatCore`)**: When constraints contradict each other, `m.check()` returns the conflicting constraint names (via built-in HiGHS elastic relaxation or Z3 `unsatCore`).
3. **Direct Lookup (`m.getConstraintByName()`)**: Retrieve a constraint by name after solving to inspect its `dual` or `slack` value.

---

## Aggregated Constraints (`sum` & `dot`)

Use `sum(...)` and `dot(..., ...)` directly inside `expr` to express linear aggregations over arrays and dictionaries cleanly:

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const items = ["A", "B", "C"] as const;
const weights = { A: 5, B: 10, C: 15 };
const selected = m.binary(items);

// Select at most 2 items
m.constraint(expr`sum(${selected}) <= 2`, "max_items");

// Total weight cannot exceed capacity 25
m.constraint(expr`dot(${weights}, ${selected}) <= 25`, "capacity_limit");
```

---

## Conditional / Indicator Constraints (`m.indicator`)

When a linear constraint should only take effect when a binary decision variable (`m.binary()`) equals `1` (or `0`), use `m.indicator()`:

```typescript
const useDiscount = m.binary("use_discount");
const cartTotal = m.continuous("cart_total", { lb: 0, ub: 10_000 });

// If useDiscount == 1, enforce cartTotal >= 100
// WaSHI automatically derives a safe, tight Big-M from the variable bounds
m.indicator(useDiscount, expr`${cartTotal} >= 100`, {
  activeValue: 1,
  name: "min_spend_for_discount",
});
```

### Safe Automatic Big-M Derivation & Bounds

When `options.M` is omitted, WaSHI automatically derives a minimal valid Big-M value from finite variable bounds (`lb` and `ub`):
- For `<=` constraints, variables with positive coefficients require finite upper bounds (`ub`), and negative coefficients require finite lower bounds (`lb`).
- For `>=` constraints, variables with positive coefficients require finite lower bounds (`lb`), and negative coefficients require finite upper bounds (`ub`).
- For `==` constraints, bounds are derived separately for both the `<=` and `>=` directions (generating `name_le` and `name_ge`).

If any referenced variable lacks the required finite bound, `m.indicator()` throws an error prompting for finite bounds or an explicit `options.M`.

### Explicit `M` Override

You can override the derived Big-M by passing `{ M: number }`:

```typescript
m.indicator(useDiscount, expr`${cartTotal} >= 100`, {
  activeValue: 1,
  M: 10_000, // Explicit override
});
```

> [!TIP]
> **Prefer Finite Variable Bounds Over Arbitrary Large `M`**: An $M$ value that is too small can cut off valid feasible solutions, whereas an excessively large $M$ (e.g., $10^9$) degrades numerical conditioning in MIP solvers. Setting realistic `lb` and `ub` bounds on variables lets WaSHI compute the tightest safe Big-M automatically.

---

## Propositional Logic & SMT Constraints (`BoolVar`, `and`, `or`, `not`, `implies`, `xor`)

WaSHI provides first-class logical operators to combine propositional boolean variables (`m.bool()`) and linear constraints (`Constraint`). Logical formulas are solved natively by the **Z3** SMT adapter (`@ohtaman/washi/solvers/z3`) and automatically linearized to 0-1 MIP constraints on **HiGHS** and **GLPK**:

```typescript
import { Model, expr, and, or, not, implies, xor } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ solver: "z3" });
const isAdmin = m.bool("isAdmin");
const hasMfa = m.bool("hasMfa");
const clearance = m.integer("clearance", { lb: 0, ub: 5 });

// Method syntax on BoolVar / BoolOp:
m.constraint(isAdmin.implies(hasMfa), "admin_requires_mfa");

// Mixing boolean propositions with linear arithmetic comparisons:
m.constraint(
  implies(isAdmin, expr`${clearance} >= 4`),
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
| **Target Solvers** | **All MIP/LP solvers** (HiGHS, GLPK, Z3) via Big-M linearization | **All solvers** (HiGHS and GLPK via automatic 0-1 MIP linearization, Z3 natively) |
| **Primary Use Case** | MIP optimization models with arithmetic binary variables (`m.solve()`) | Logical rule systems and SMT feasibility (`m.check()`) |

> [!NOTE]
> **General Inequality Antecedents in `implies()`**: On **Z3** (`solver: "z3"`), the antecedent `a` in `implies(a, b)` can be any linear inequality—for example, ``implies(expr`${clearance} >= 4`, hasMfa)`` using `clearance` and `hasMfa` above. On MIP solvers (**HiGHS** / **GLPK**), conditional constraints should use a `BoolVar` (`m.bool()`) antecedent or `m.indicator(binVar, constraint)` with a `Binary` trigger variable.

---

## Dual Values, Shadow Prices & Lookups

For continuous Linear Programming (LP) problems, query the shadow price (`dual`) and surplus (`slack`) on each constraint (returned by `m.constraint()` or looked up via `m.getConstraintByName()`):

```typescript
const woodConstraint = m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood");

await m.solve();

console.log("Shadow price (dual):", woodConstraint.dual);
console.log("Slack surplus:", woodConstraint.slack);
console.log("Total linear constraints:", m.numConstrs);
```

For named logical constraints, use `m.getLogicalConstraintByName(name)` to look up the registered `LogicalConstraintItem`.

> [!TIP]
> For modeling techniques such as **soft constraints with slack variables** and **symmetry breaking**, see [Formulation Patterns & Optimization Tips](./formulation-tips.md#_3-constraint-design-numerical-conditioning).
