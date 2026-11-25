# Constraints (`m.constraint` & `m.indicator`)

Constraints define the rules that every valid solution must satisfy.
In WaSHI, linear arithmetic constraints, logical rules, and CP global constraints are all registered with `m.constraint()`:

```typescript
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_limit");
```

---

## Algebraic Linear Constraints (`expr`)

Use the `expr` tagged template literal to write linear equations and inequalities in standard algebraic notation:

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

- `<=`: Upper-bound inequality.
- `>=`: Lower-bound inequality.
- `==` or `=`: Exact equality.
- `<`, `>`, `!=`: Strict inequality and not-equal constraints for integer-valued expressions only (see [Discrete Comparisons](#discrete-comparisons)).

### Batch Registration

Pass an array of constraints to `m.constraint([...])` to register them atomically.
If any item in the array is invalid, none of them are added:

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

1. **Model inspection (`m.toLpString()`)**: Exported CPLEX LP strings retain your constraint names so you can audit the generated formulation.
2. **Conflict diagnosis (`conflicts` / `unsatCore`)**: When constraints contradict each other, `m.check()` reports the conflicting constraint names.
3. **Direct lookup (`m.constraints.get()`)**: After solving, fetch any named constraint to read its `dual` or `slack` value.

---

## Constraints with Sums & Dot Products (`sum` & `dot`)

Use `sum(...)` and `dot(..., ...)` directly inside `expr` to express linear aggregations over arrays and dictionaries:

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

## Dual Values, Shadow Prices & Lookups

For continuous Linear Programming (LP) models solved by HiGHS, each linear constraint exposes two sensitivity properties after `m.solve()` (GLPK populates `dual` only and leaves `slack` as `null`):

- **`dual` (shadow price)**: The marginal signed change in the optimal objective value per unit increase in the constraint's right-hand side (while the optimal basis remains unchanged).
- **`slack`**: The unused margin between the constraint's left-hand side and right-hand side at the optimal solution (`0` when the constraint is tight).

Both properties have type `number | null` and are `null` before solving, when no optimal LP solution is found, or on MIP, CP, SMT, and logical constraints.

```typescript
const woodConstraint = m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood");

await m.solve();

console.log("Shadow price (dual):", woodConstraint.dual);
console.log("Slack:", woodConstraint.slack);
console.log("Looked-up dual:", m.constraints.get("wood")?.dual); // number | null
console.log("Total constraints:", m.constraints.size);
```

---

## Conditional / Indicator Constraints (`m.indicator`)

Use `m.indicator()` when a linear constraint should only apply if a binary variable (`m.binary()`) equals `1` or `0`.
In MIP formulations, this conditional rule is encoded via the **Big-M method**—for example, $a^\top x \le b + M(1 - y)$ enforces $a^\top x \le b$ when $y = 1$, and relaxes it with a large constant $M$ when $y = 0$:

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

When `options.M` is omitted, WaSHI computes the smallest valid Big-M from finite variable bounds (`lb` and `ub`):

- For `<=` constraints, positive coefficients require finite `ub` and negative coefficients require finite `lb`.
- For `>=` constraints, positive coefficients require finite `lb` and negative coefficients require finite `ub`.
- For `==` constraints, WaSHI derives bounds for both directions separately, creating `name_le` and `name_ge`.

If any referenced variable lacks a required finite bound, `m.indicator()` throws an error asking for finite bounds or an explicit `options.M`.

> [!NOTE]
> **How `m.indicator()` works across MIP, CP, and SMT solvers**: When `options.M` is omitted, `m.indicator()` returns an array of Big-M linear `Constraint` objects (`Constraint[]`) that also carry a native-indicator annotation.
> HiGHS, GLPK, and `m.toLpString()` use the Big-M inequalities directly, while Pumpkin and Z3 read the annotation to solve the implication natively without Big-M numerical issues or weak relaxations.
> If you later mutate any returned `Constraint` object, WaSHI clears that annotation so your direct edits take effect across every solver.

### Explicit `M` Override

You can override the derived Big-M by passing `{ M: number }`:

```typescript
m.indicator(useDiscount, expr`${cartTotal} >= 100`, {
  activeValue: 1,
  M: 10_000, // Explicit override
});
```

> [!TIP]
> **Prefer Finite Variable Bounds Over Arbitrary Large `M`**: Too small an $M$ can cut off valid solutions, while an excessively large $M$ (such as $10^9$) weakens LP relaxations and harms MIP numerical stability.
> Setting realistic `lb` and `ub` bounds lets WaSHI compute the tightest safe Big-M automatically.

---

## Propositional Logic & SMT Constraints (`BoolVar`, `and`, `or`, `not`, `implies`, `xor`)

WaSHI provides first-class logical operators that combine `BoolVar` variables from `m.bool()` with linear `Constraint` objects.
Pumpkin and Z3 solve these formulas natively, while HiGHS and GLPK automatically linearize them into 0-1 MIP constraints.
Register optional backends with `@ohtaman/washi/solvers/pumpkin` or `@ohtaman/washi/solvers/z3`.

> [!IMPORTANT]
> **Solver Preconditions**:
> - **Pumpkin**: Every numeric variable must be `Integer` or `Binary` with finite `lb` and `ub`.
> - **Z3**: Requires the optional dependency `z3-solver` (`npm install z3-solver`). In browsers, Z3 also requires `COOP`/`COEP` response headers for `SharedArrayBuffer`.

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

All registered constraints (including auto-named ones) are stored in `m.constraints` (`ReadonlyMap<string, Constraint | LogicalConstraint>`) and can be looked up with `m.constraints.get(name)`.
Logical and CP entries use the shape `{ kind: "logical", name, expr, dual: null, slack: null }`.

### Choosing Between `m.indicator()` and `implies()`

| Feature | `m.indicator(binVar, constraint, opts)` | `implies(a, b)` / `a.implies(b)` |
| :--- | :--- | :--- |
| **Trigger variable** | Numeric `Binary` variable (`m.binary()`) | `BoolVar` (`m.bool()`), `BoolOp`, or `Constraint` |
| **Consequent** | Linear `Constraint` (`<=`, `>=`, `==`) | `BoolVar`, `BoolOp`, or linear `Constraint` |
| **Target Solvers** | All solvers (Big-M on HiGHS/GLPK; native on Pumpkin/Z3 when `M` is omitted) | All solvers (automatic 0-1 MIP on HiGHS/GLPK; native on Pumpkin/Z3) |
| **Primary Use Case** | MIP optimization models using numeric binary variables | Logical rule systems and SMT feasibility checks |

> [!NOTE]
> **Negating Comparison Constraints (arguments of `not` or `xor`, or the condition of `implies`)**:
> - **Integer expressions**: Negations such as $\neg(x \le 5)$ are converted automatically to $x \ge 6$ on HiGHS and GLPK, and handled natively on Pumpkin and Z3.
> - **`Continuous` or decimal expressions**: HiGHS and GLPK reject negated continuous comparisons because strict `<` and `>` cannot form closed linear inequalities. Use `{ solver: "z3" }` or model the condition with `m.bool()`.

---

## Discrete Comparisons (`!=`, `<`, `>`)

WaSHI supports `!=`, `<`, and `>` inside `expr` as well as via `.ne()`, `.lt()`, and `.gt()` on `Var`, `LinExpr`, and `QuadExpr`.
These operators apply strictly to **integer-valued expressions**—expressions built from `Integer` or `Binary` variables with safe-integer coefficients and constants:

```typescript
const rankA = m.integer("rankA", { lb: 1, ub: 4 });
const rankB = m.integer("rankB", { lb: 1, ub: 4 });
const roomA = m.integer("roomA", { lb: 1, ub: 3 });
const roomB = m.integer("roomB", { lb: 1, ub: 3 });

m.constraint(expr`${rankA} < ${rankB}`, "strict_order"); // lowered via rankA - rankB <= -1
m.constraint(expr`${roomA} != ${roomB}`, "diff_room");   // native on Pumpkin/Z3, single-binary MIP on HiGHS/GLPK
```

Expressions containing `Continuous` variables or decimal constants are rejected immediately for `!=`, `<`, and `>`.
Over real numbers, strict inequalities define open sets—for example, maximizing $x$ subject to $x < 5$ has no optimal real solution.
LP and MIP solvers therefore require closed inequalities ($\le$, $\ge$, $=$) so an optimum is well-defined.

---

## CP Global Constraints (`distinct`, `disjoint`, `cumulative`, `allowed`)

WaSHI provides backend-agnostic Constraint Programming **global constraints**—higher-level predicates over groups of variables that return composable `BoolExpr` objects.
They combine freely with `and`, `or`, `not`, `implies`, and `xor`.
For interval scheduling, symmetry breaking, and Pumpkin modeling patterns, see the [Constraint Programming (CP) Modeling Guide](./constraint-programming.md).

| Predicate | Meaning | HiGHS / GLPK | Pumpkin | Z3 |
| :--- | :--- | :--- | :--- | :--- |
| `distinct(...args)` | All values are pairwise different (`!=`) | Pairwise `!=` MIP | Native `all_different` | Native `Distinct` |
| `disjoint(tasks)` | Tasks `[start, start + duration)` do not overlap | Pairwise ordering + Big-M | Native non-overlap | Pairwise `Or` |
| `cumulative(tasks, capacity)` | Total demand $\le$ `capacity` at every moment | Time-indexed MIP (errors above 5,000 steps / 25,000 vars) | Native `cumulative` | Event-point load |
| `allowed(vars, tuples)` | Values match a row in `tuples` (`not(allowed(...))` forbids them) | Tuple selector binaries | Native table | Tuple `Or` / `And` |

```typescript
import { Model, expr, distinct, disjoint, cumulative, allowed, not, minimize } from "@ohtaman/washi";

const m = new Model("ScheduleAndAssign");
const s = m.integer(2, { lb: 0, ub: 10, prefix: "s" });
const room = m.integer(2, { lb: 1, ub: 2, prefix: "room" });

m.constraint(distinct(room), "unique_rooms");
m.constraint(disjoint([{ start: s[0], duration: 4 }, { start: s[1], duration: 3 }]), "machine_1");
m.constraint(not(allowed([room[0], room[1]], [[1, 2]])), "forbid_1_2");
m.constraint(cumulative([{ start: s[0], duration: 4, demand: 1 }, { start: s[1], duration: 3, demand: 1 }], 2), "workers");
m.objective(minimize(expr`${s[0]} + ${s[1]}`));
```

> [!TIP]
> For **soft constraints with slack variables** and **symmetry breaking**, see [Formulation Patterns & Optimization Tips](./formulation-tips.md#_3-constraint-design-numerical-conditioning).
