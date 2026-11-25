# Variables & Domains

Variables represent the unknown decision quantities in an optimization or logical model.
On a `Model` instance, WaSHI provides four domain-specific factory methods: `m.continuous()`, `m.integer()`, `m.binary()`, and `m.bool()`.

---

## Decision Variable Types

### 1. Continuous Variables (`m.continuous`)

Continuous variables take any real number bounded by `lb` and `ub` (default: `lb = 0`, `ub = Infinity`).
Use them for divisible quantities such as flow rates, weights, budgets, and portfolio weights:

```typescript
import { Model } from "@ohtaman/washi";

const m = new Model();

// Single continuous variable bounded in [0, 1000]
const fuel = m.continuous("fuel", { lb: 0, ub: 1000 });
```

### 2. Integer Variables (`m.integer`)

Integer variables take whole numbers bounded by `lb` and `ub` (default: `lb = 0`, `ub = Infinity`).
Use them for indivisible counts such as vehicles, machines, or staff headcount:

```typescript
// Single integer variable bounded in [0, 15]
const trucks = m.integer("trucks", { lb: 0, ub: 15 });
```

### 3. Binary Variables (`m.binary`)

Binary variables take numeric values in $\{0, 1\}$ with `lb = 0` and `ub = 1` set automatically.
Use them for yes/no decisions in Mixed-Integer Programming (MIP) that appear in linear sums or objective costs:

```typescript
// Single binary variable (lb = 0, ub = 1 automatically)
const openWarehouse = m.binary("open_warehouse");
```

### 4. Propositional Boolean Variables (`m.bool`)

Propositional Boolean variables take pure truth values (`true` or `false`) for logical and Satisfiability Modulo Theories (SMT) rules:

```typescript
// Single propositional boolean variables
const isAdmin = m.bool("isAdmin");
const hasMfa = m.bool("hasMfa");

// First-class boolean operators: and, or, not, implies, xor
m.constraint(isAdmin.implies(hasMfa), "admin_requires_mfa");
```

### Choosing Between `m.binary()` and `m.bool()`

| Feature | `m.binary()` (`Var`) | `m.bool()` (`BoolVar`) |
| :--- | :--- | :--- |
| **Solved `.value` type** | `number \| null` (`0` or `1`) | `boolean \| null` (`true` or `false`) |
| **Linear arithmetic (`expr`, `sum`, `dot`, objective costs)** | ✅ Native (`` expr`30 * ${b}` ``) | ❌ Cannot be multiplied by numbers or summed directly |
| **Indicator constraints (`m.indicator(b, ...)`)** | ✅ Supported as trigger variable | ❌ Use `` implies(flag, expr`...`) `` instead |
| **Propositional logic (`and`, `or`, `not`, `implies`, `xor`)** | Via comparison (`` expr`${b} == 1` ``) | ✅ Native first-class methods (`.implies()`, `.and()`) |
| **Best used for** | Arithmetic sums, objective costs, `m.indicator()` | Pure logical rules without numeric coefficients |

---

## Multi-Dimensional & Array Creation

All four factory methods (`continuous`, `integer`, `binary`, `bool`) accept counts or string-key arrays.
This lets you create 1D arrays, typed dictionaries, and 2D matrices in a single call.

### By Count

Pass a number to create an array of variables:

```typescript
const x = m.continuous(5, { lb: 0 }); // Var[] (x_0, ..., x_4)
const flags = m.bool(3);              // BoolVar[] (p_0, p_1, p_2)
```

### 1D Variable Dictionaries

Pass an array of string keys to create a typed dictionary (`Record<K, Var>` or `Record<K, BoolVar>`):

```typescript
const items = ["laptop", "phone", "tablet"] as const;

// Record<"laptop" | "phone" | "tablet", Var>
const selected = m.binary(items);

const perms = m.bool(["read", "write", "execute"] as const);
// perms.read, perms.write, perms.execute
```

### 2D Variable Matrices & Grids

Each dimension follows one rule: a numeric count produces an `Array`, and a key list produces a `Record`.

- `(rowsCount, colsCount)` $\rightarrow$ `Var[][]` (or `BoolVar[][]`)
- `(rowKeys, colKeys)` $\rightarrow$ `Record<R, Record<C, Var>>` (or `Record<R, Record<C, BoolVar>>`)
- `(rowsCount, colKeys)` $\rightarrow$ `Array<Record<C, Var>>`
- `(rowKeys, colsCount)` $\rightarrow$ `Record<R, Var[]>`

```typescript
const factories = ["Tokyo", "Osaka"];
const stores = ["StoreA", "StoreB", "StoreC"];

// 1. Named keys x Named keys -> Record<string, Record<string, Var>>
const ship = m.continuous(factories, stores, { lb: 0 });
// ship.Tokyo.StoreA

// 2. Numeric count x Numeric count -> Var[][] (2D Array)
const board = m.binary(8, 8, { prefix: "queen" });
// board[0][0], board.map(...)

// 3. Mixed dimensions: Named keys x Numeric count -> Record<string, Var[]>
const schedule = m.binary(factories, 7, { prefix: "open_day" });
// schedule.Tokyo[0]
```

---

## Variable Options

Each factory method accepts options matching its variable kind.
`m.continuous()` and `m.integer()` accept all factory options below, `m.binary()` omits `lb` and `ub`, and `m.bool()` accepts `name` and `prefix` only.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `name` | `string` | Auto-generated | Explicit name for a scalar variable (alternative to passing the name as the first argument). |
| `lb` | `number` | `0` | Lower bound (`m.continuous()`, `m.integer()`). Pass a negative finite number or `-Infinity` to allow negative values. |
| `ub` | `number` | `Infinity` (`1` for binary) | Upper bound (`m.continuous()`, `m.integer()`). Fixed to `1` for `m.binary()`. |
| `prefix` | `string` | `"x"` (`"p"` for `m.bool()`) | Name prefix for unnamed scalars, arrays, dictionaries, and 2D containers (e.g., `queen_0_0`). |
| `type` | `"Continuous"` \| `"Integer"` \| `"Binary"` | Inferred from method | Numeric variable domain (applies to direct `new Var()` construction only). |
| `initialValue` | `number` | `undefined` | Warm-start hint for numeric variables (`m.continuous()`, `m.integer()`, `m.binary()`), stored separately from solved `variable.value`. |

### Designing Bounds (`lb` & `ub`)

- **Allowing negative values**: Numeric variables are non-negative by default. For signed quantities such as net inventory change or deviation, explicitly pass a negative finite bound or `{ lb: -Infinity }`.
- **Strengthening MIP formulations**: Realistic finite `lb` and `ub` bounds improve MIP presolve and let `m.indicator()` compute tight Big-M constants automatically.
- **CP solver requirement**: Bounded-integer Constraint Programming (CP) solvers such as Pumpkin require finite integer bounds on every numeric variable.

---

## Primal Initial Values (Warm-Start Hints)

When re-solving a modified model, you can supply a warm-start hint (`initialValue`) on some or all numeric variables.
Pass `initialValue` in the factory options or assign `v.initialValue = ...` directly:

```typescript
const prevValues: Record<string, number | null> = { trucks: 8, open_warehouse: 1 };

const m2 = new Model("RebuiltMIP");
const trucks2 = m2.integer("trucks", {
  lb: 0,
  ub: 15,
  initialValue: prevValues.trucks ?? undefined,
});
const openWarehouse2 = m2.binary("open_warehouse", {
  initialValue: prevValues.open_warehouse ?? undefined,
});
const extraCapacity = m2.continuous("extra_capacity", { lb: 0 }); // Partial start: no initialValue needed
```

### Hint vs. Hard Constraint

`initialValue` is an optional starting hint for the solver, not a constraint or variable fixation.
Before solving, `variable.value` remains `null`.
To penalize changes from an existing schedule in the objective instead, see [Formulation Patterns & Tips](./formulation-tips.md#minimal-perturbation-rescheduling-vs-warm-starting).

### Validation & Tolerance (`1e-6`)

Every supplied `initialValue` must be a finite number within `[lb - 1e-6, ub + 1e-6]`.
For `"Integer"` and `"Binary"` variables, the value must also lie within `1e-6` of an integer.
Partial starts are allowed; providing a complete feasible assignment gives MIP solvers an immediate incumbent solution (a valid baseline objective value used to prune search branches).

### Solver Support

- **Supported**: HiGHS supports warm starts on all numeric variables. Pumpkin supports them on bounded `Integer` and `Binary` variables in both `solve()` and `check()`.
- **Unsupported**: GLPK, Z3, and custom adapters without warm-start support reject `solve()` and `check()` with an explicit error instead of silently ignoring `initialValue`.

---

## Accessing Solution Values & Reduced Costs

After calling `await m.solve()` or `await m.check()`, read assigned values directly from `variable.value` or look them up by name in `m.values`.
`variable.value` returns `number | null` for `Var` and `boolean | null` for `BoolVar`.

For continuous Linear Programming (LP) models—or LP relaxations solved via `m.relax()`—on HiGHS, `variable.reducedCost` exposes the variable's reduced cost as `number | null`.
The **reduced cost** indicates how much a non-basic variable's objective coefficient must improve before moving it away from its active bound (`lb` or `ub`) becomes worthwhile.
`reducedCost` is `null` before solving, when no optimal LP solution is found, on GLPK (which populates constraint `dual` only), on MIP models solved with `m.solve()`, and on CP and SMT models.

```typescript
await m.solve();

// Scalar variable primal & boolean values
console.log(`trucks: ${trucks.value}`);
console.log(`isAdmin: ${isAdmin.value}`);

// Indexed 1D & 2D variable containers
const packedItems = items.filter((it) => selected[it].value === 1);
console.log(`Tokyo -> StoreA: ${ship.Tokyo.StoreA.value}`);

// Name-keyed ReadonlyMap lookup (ReadonlyMap<string, number | boolean>)
console.log(`trucks by name: ${m.values.get("trucks")}`);

// Reduced cost (LP sensitivity analysis; number | null)
console.log(`fuel reduced cost: ${fuel.reducedCost}`);
```

---

## Looking Up Variables by Name

All registered numeric (`Var`) and propositional Boolean (`BoolVar`) variables are accessible through `m.variables` (`ReadonlyMap<string, Var | BoolVar>`):

```typescript
const v = m.variables.get("trucks");   // Var | BoolVar | undefined
const b = m.variables.get("isAdmin");  // Var | BoolVar | undefined
console.log("Has trucks:", m.variables.has("trucks"));
console.log("Total variables:", m.variables.size);

// Narrow by v.type ("Continuous" | "Integer" | "Binary" | "Boolean"):
if (v && v.type !== "Boolean") {
  console.log("Bounds:", v.lb, v.ub);
}
```
