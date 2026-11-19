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
- `<`, `>`, `!=`: Discrete strict inequality / disequality constraints (integer-valued expressions only; see [Discrete Comparisons](#discrete-comparisons))

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
2. **Conflict Diagnosis (`conflicts` / `unsatCore`)**: When constraints contradict each other, `m.check()` returns the conflicting constraint names (via built-in HiGHS elastic relaxation, bundled Pumpkin `unsatCore`, or Z3 `unsatCore`).
3. **Direct Lookup (`m.constraints.get()`)**: Retrieve any registered constraint by name after solving to inspect its `dual` or `slack` value.

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

## Dual Values, Shadow Prices & Lookups

For continuous Linear Programming (LP) problems, query the shadow price (`dual`) and surplus (`slack`) on each constraint (returned by `m.constraint()` or looked up via `m.constraints.get()`):

```typescript
const woodConstraint = m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood");

await m.solve();

console.log("Shadow price (dual):", woodConstraint.dual);
console.log("Slack surplus:", woodConstraint.slack);
console.log("Looked-up dual:", m.constraints.get("wood")?.dual); // number | null (null for MIP, CP, or logical constraints)
console.log("Total constraints:", m.constraints.size);
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

> [!NOTE]
> **Native Indicator Lowering on Pumpkin & Z3**: When `options.M` is omitted, `m.indicator()` still returns Big-M-linearized `Constraint[]` rows (so `m.toLpString()`, HiGHS, and GLPK stay identical and backward compatible) while annotating those rows so **Pumpkin** lowers natively via `implied_by` and **Z3** lowers natively via `ctx.Implies` without Big-M numerical degradation. Mutating a returned row clears that metadata so subsequent edits take effect directly.

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

WaSHI provides first-class logical operators to combine propositional boolean variables (`m.bool()`) and linear constraints (`Constraint`). Logical formulas are solved natively by **Pumpkin** (`@ohtaman/washi/solvers/pumpkin`, for bounded integer & boolean models) and **Z3** (`@ohtaman/washi/solvers/z3`), and automatically linearized to 0-1 MIP constraints on **HiGHS** and **GLPK**:

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

All named constraints—both linear `Constraint`s and logical/CP `LogicalConstraint`s (`{ kind: "logical", name, expr, dual: null, slack: null }`)—are stored uniformly in `m.constraints` (`ReadonlyMap<string, Constraint | LogicalConstraint>`) and can be looked up by name via `m.constraints.get(name)`.

### Choosing Between `m.indicator()` and `implies()`

| Feature | `m.indicator(binVar, constraint, opts)` | `implies(a, b)` / `a.implies(b)` |
| :--- | :--- | :--- |
| **Trigger variable** | Numeric `Binary` variable (`m.binary()`) | `BoolVar` (`m.bool()`), `BoolOp`, or `Constraint` |
| **Consequent** | Linear `Constraint` (`<=`, `>=`, `==`) | `BoolVar`, `BoolOp`, or linear `Constraint` |
| **Target Solvers** | **All MIP/LP solvers** (HiGHS, GLPK via Big-M; Pumpkin/Z3 natively when `M` omitted) | **All solvers** (HiGHS and GLPK via automatic 0-1 MIP linearization, Pumpkin and Z3 natively) |
| **Primary Use Case** | MIP optimization models with arithmetic binary variables (`m.solve()`) | Logical rule systems and SMT feasibility (`m.check()`) |

> [!NOTE]
> **Comparison Constraints in Negated Positions (`implies` Antecedents, `not`, `xor`)**: Linear comparison constraints whose referenced variables are all `Integer` or `Binary` with integer coefficients and integer right-hand sides (plus required finite bounds for Big-M indicators, such as ``implies(expr`${clearance} >= 4`, hasMfa)`` above) are linearized automatically on **HiGHS** and **GLPK** via exact $\pm 1$ integer shifts ($\neg(a^\top x \le b) \iff a^\top x \ge b + 1$, and $a^\top x \ne b \iff a^\top x \le b - 1 \lor a^\top x \ge b + 1$), and solved natively on **Pumpkin** and **Z3**. When a comparison constraint containing `Continuous` variables or non-integer coefficients/thresholds appears in a negated position, MIP `solve()` / `check()` throws an error because strict-inequality negation forms an open half-space—use `{ solver: "z3" }`, or write an explicit closed-tolerance disjunction such as ``or(expr`... >= ... + eps`, ...)`` or an `m.bool()` proposition.

---

## Discrete Comparisons (`!=`, `<`, `>`)

WaSHI supports discrete comparisons `!=`, `<`, and `>` in `expr` (and fluent `.ne()`, `.lt()`, `.gt()` on `Var`, `LinExpr`, and `QuadExpr`) strictly for **integer-valued expressions** (`Integer` or `Binary` variables with safe-integer coefficients and constants):

```typescript
const rankA = m.integer("rankA", { lb: 1, ub: 4 });
const rankB = m.integer("rankB", { lb: 1, ub: 4 });
const roomA = m.integer("roomA", { lb: 1, ub: 3 });
const roomB = m.integer("roomB", { lb: 1, ub: 3 });

m.constraint(expr`${rankA} < ${rankB}`, "strict_order"); // lowered via rankA - rankB <= -1
m.constraint(expr`${roomA} != ${roomB}`, "diff_room");   // native not_equals on Pumpkin, neq on Z3, single-binary MIP on HiGHS/GLPK
```

Expressions involving `Continuous` variables or fractional numbers in `!=`, `<`, or `>` are rejected immediately because open inequalities ($x < b$, $x \ne b$) are not closed polyhedra on continuous domains.

---

## CP Global Constraints (`distinct`, `disjoint`, `cumulative`, `allowed`)

WaSHI provides backend-agnostic Constraint Programming predicates returning composable `BoolExpr` objects (combinable with `and`, `or`, `not`, `implies`, `xor`). For interval scheduling, symmetry breaking, and solver modeling patterns with **Pumpkin**, see the dedicated [Constraint Programming (CP) Modeling Guide](./constraint-programming.md).

| Predicate | Semantics | HiGHS / GLPK | Pumpkin | Z3 |
| :--- | :--- | :--- | :--- | :--- |
| `distinct(...args)` | Pairwise `a != b` across integer expressions / 1D–2D containers (`AllDifferent`) | Pairwise `!=` MIP | `all_different` | `ctx.Distinct` |
| `disjoint(tasks)` | Non-overlapping intervals `[start, start + duration)` on unary resource (`NoOverlap` / `Disjunctive`; `duration >= 0` integer; duration-0 only at boundaries) | Pairwise binary precedence + Big-M | `disjunctive_strict` (Vilím edge-finding) | Pairwise `Or` disjunctions |
| `cumulative(tasks, capacity)` | Resource usage $\le$ `capacity` across all time points (`duration >= 0`, `demand >= 0` integer) | Time-indexed MIP (throws horizon guard error above 5,000 span / 25,000 pulse vars recommending `{ solver: "pumpkin" }`) | Native `cumulative` time-table filtering | Start-event load assertions |
| `allowed(vars, tuples)` | Tuple `(vars[0], ...) in tuples` (`Table` / `AllowedAssignments`; use `not(allowed(...))` for forbidden tuples) | Tuple selector binaries (`not` emits 0-binary cuts on 2-valued vars) | `table` / `negative_table` | Tuple `Or` / `And` |

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
> For modeling techniques such as **soft constraints with slack variables** and **symmetry breaking**, see [Formulation Patterns & Optimization Tips](./formulation-tips.md#_3-constraint-design-numerical-conditioning).
