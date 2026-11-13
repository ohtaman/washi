# Variables & Domains

Variables represent the mathematical decision variables in your optimization or logical model.
WaSHI provides domain-specific factory methods on the `Model` instance: `m.continuous()`, `m.integer()`, `m.binary()`, and `m.bool()`.

---

## Decision Variable Types

### 1. Continuous Variables (`m.continuous`)
Can take any real number value within `[lb, ub]`. Used for continuous quantities such as flow rates, weights, budgets, and portfolio allocations:

```typescript
import { Model } from "@ohtaman/washi";

const m = new Model();

// Single continuous variable bounded in [0, 1000]
const fuel = m.continuous("fuel", { lb: 0, ub: 1000 });
```

### 2. Integer Variables (`m.integer`)
Restricted to integer values within `[lb, ub]`. Used for discrete counts such as machines, vehicles, or headcount:

```typescript
// Single integer variable bounded in [0, 15]
const trucks = m.integer("trucks", { lb: 0, ub: 15 });
```

### 3. Binary Variables (`m.binary`)
Restricted to $\{0, 1\}$ as numeric values (`lb = 0`, `ub = 1`). Used for 0-1 MIP selection and yes/no decisions that appear in linear sums or objective costs:

```typescript
// Single binary variable (lb = 0, ub = 1 automatically)
const openWarehouse = m.binary("open_warehouse");
```

### 4. Propositional Boolean Variables (`m.bool`)
Pure boolean propositions (`true` / `false`) for logical and SMT constraints:

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
| **Indicator constraints (`m.indicator(b, ...)` )** | ✅ Supported as trigger variable | ❌ Use `` implies(flag, expr`...`) `` instead |
| **Propositional logic (`and`, `or`, `not`, `implies`, `xor`)** | Via comparison (`` expr`${b} == 1` ``) | ✅ Native first-class methods (`.implies()`, `.and()`) |
| **Solver execution** | Native 0-1 MIP on HiGHS/GLPK; bounded integer on Z3 | Native boolean proposition on Z3; auto-linearized to 0-1 MIP on HiGHS/GLPK |

> [!TIP]
> Use **`m.binary()`** when a decision participates in arithmetic expressions—such as linear sums ($\sum x_i \ge 3$), objective cost terms ($c_i x_i$), or `m.indicator()`. Use **`m.bool()`** when expressing logical conditions with `implies()`, `and()`, and `or()` without numeric coefficients.

---

## Multi-Dimensional & Array Creation

The domain factory methods (`continuous`, `integer`, `binary`, `bool`) accept a numeric count or an array of string keys to create 1D arrays, typed dictionaries, and 2D matrices in a single call.

### By Count
Pass a number to create an array of variables:

```typescript
const x = m.continuous(5, { lb: 0 }); // Var[] (x_0, ..., x_4)
const flags = m.bool(3);              // BoolVar[] (p_0, p_1, p_2)
```

### 1D Variable Dictionaries
Pass an array of keys to get a typed dictionary `Record<K, Var>` or `Record<K, BoolVar>`:

```typescript
const items = ["laptop", "phone", "tablet"] as const;

// Record<"laptop" | "phone" | "tablet", Var>
const selected = m.binary(items);

const perms = m.bool(["read", "write", "execute"] as const);
// perms.read, perms.write, perms.execute
```

### 2D Variable Matrices & Grids
Each dimension follows a consistent rule: passing a numeric count (`number`) produces an `Array`, and passing a collection of keys produces a `Record`:
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

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `lb` | `number` | `0` | Lower bound. Defaults to `0` (non-negative). |
| `ub` | `number` | `Infinity` (or `1` for binary) | Upper bound. |
| `type` | `"Continuous"` \| `"Integer"` \| `"Binary"` | Inferred from method | Underlying variable domain category. |
| `initialValue` | `number` | `undefined` | Optional primal solution hint (MIP warm start), kept distinct from solved `variable.value`. |

---

## Primal Initial Values (Warm-Start Hints)

When rebuilding a model across iterations, you can supply optional primal initial values (`initialValue`) on a subset or all numeric variables (`m.continuous`, `m.integer`, `m.binary`, or `v.initialValue = ...`):

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

- **Hint vs. Hard Constraint**: `initialValue` is an optional solver hint (passed to HiGHS via `setSolution`). It does **not** fix the variable or add a constraint, and `variable.value` remains `null` until solved. *(To penalize deviations from a previous plan, see [Formulation Patterns & Tips](./formulation-tips.md#minimal-perturbation-rescheduling-vs-warm-starting).)*
- **Validation & Tolerance (`1e-6`)**: Supplied values must be finite numbers within `[lb - 1e-6, ub + 1e-6]` (and within `1e-6` of an integer for `"Integer"` and `"Binary"` variables). Partial starts are accepted without needing to satisfy every model constraint, though supplying a complete constraint-feasible assignment gives MIP solvers an immediate incumbent bound.
- **Solver Support**: Supported by **HiGHS** (`capabilities.supportsWarmStart === true`). Solvers without warm-start support (**GLPK**, **Z3**, or custom adapters without `supportsWarmStart: true`) reject `solve()` and `check()` with a descriptive error rather than silently ignoring `initialValue`.

---

## Accessing Solution Values & Reduced Costs

After calling `await m.solve()` or `await m.check()`, assigned variable values are accessible via `variable.value` (returns `number | null` for `Var`, or `boolean | null` for `BoolVar`) or the bulk accessor `m.getValues()`:

```typescript
await m.solve();

// Single variable primal value
console.log(`trucks: ${trucks.value}`);

// Reduced cost (LP sensitivity analysis)
console.log(`fuel reduced cost: ${fuel.reducedCost}`);

// Bulk extraction for 1D or 2D collections (works for both Var and BoolVar collections)
const selectedValues = m.getValues(selected);
// { laptop: 1, phone: 0, tablet: 1 }

const flowValues = m.getValues(ship);
// { Tokyo: { StoreA: 50, ... }, Osaka: { ... } }
```

---

## Looking Up Variables by Name

You can retrieve registered decision variables by name or inspect the total numeric variable count on the model:

```typescript
const v = m.getVarByName("trucks");           // Var | undefined
const b = m.getBoolVarByName("isAdmin");      // BoolVar | undefined
console.log("Total numeric variables:", m.numVars);
```
