# Variables & Domains

Variables represent the mathematical decision variables in your optimization model.
WaSHI provides domain-specific factory methods on the `Model` instance: `m.continuous()`, `m.integer()`, `m.binary()`, and `m.bool()`.

---

## Decision Variable Types

### 1. Continuous Variables (`m.continuous`)
Can take any real number value within `[lb, ub]`. Ideal for physical measurements, flow rates, budgets, and weights:

```typescript
import { Model } from "@ohtaman/washi";

const m = new Model();

// Single continuous variable bounded in [0, 1000]
const fuel = m.continuous("fuel", { lb: 0, ub: 1000 });
```

### 2. Integer Variables (`m.integer`)
Restricted to integers. Ideal for countable assets (machines, trucks, staff count):

```typescript
// Single integer variable bounded in [0, 15]
const trucks = m.integer("trucks", { lb: 0, ub: 15 });
```

### 3. Binary Variables (`m.binary`)
Restricted to $\{0, 1\}$ as mathematical 0-1 values. Ideal for MIP selection, yes/no decisions, and facility selections:

```typescript
// Single binary variable
const openWarehouse = m.binary("open_warehouse");
// lb is automatically 0, ub is automatically 1
```

### 4. Propositional Boolean Variables (`m.bool`)
Pure boolean logic propositions for SMT / SAT modeling with Z3:

```typescript
// Single propositional boolean variable
const isNight = m.bool("isNight");
const alarmTriggered = m.bool("alarmTriggered");

// First-class boolean operators: and, or, not, implies, xor
m.constraint(alarmTriggered.implies(isNight), "alarm_policy");
```

### 💡 Modeling Semi-Continuous Decisions
Semi-continuous variables take values in $\{0\} \cup [L, U]$ (either zero or between a positive lower and upper bound, useful for minimum production batches or operational thresholds).

While not a primitive `VarType` in `Model`, semi-continuous behavior is cleanly modeled by combining a continuous variable with a binary indicator variable and linking constraints ($L \cdot b \le x \le U \cdot b$):

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const batch = m.continuous("batch", { lb: 0, ub: 100 });
const isActive = m.binary("is_active");

// If isActive === 0, batch is forced to 0; if 1, batch is within [10, 100]
m.constraint(expr`${batch} >= 10 * ${isActive}`, "min_batch_run");
m.constraint(expr`${batch} <= 100 * ${isActive}`, "max_batch_run");
```

---

## Multi-Dimensional & Array Creation

The domain factory methods (`continuous`, `integer`, `binary`, `bool`) support count, arrays of keys, and row/column keys to create 1D arrays, typed dictionaries, and 2D matrices in a single call.

### By Count
Pass a number to create an array of variables:

```typescript
const x = m.continuous(5, { lb: 0 }); // Var[] (x_0, ..., x_4)
const flags = m.bool(3);              // BoolVar[] (p_0, p_1, p_2)
```

### 1D Variable Dictionaries
Pass an array of keys to get a typed dictionary `Record<string, Var>` or `Record<string, BoolVar>`:

```typescript
const items = ["laptop", "phone", "tablet"];

// Record<"laptop" | "phone" | "tablet", Var>
const selected = m.binary(items);

const perms = m.bool(["read", "write", "execute"]);
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
| `lb` | `number` | `0` | Lower bound. Defaults to 0 (non-negative). |
| `ub` | `number` | `Infinity` (or `1` for binary) | Upper bound. |
| `type` | `"Continuous"` \| `"Integer"` \| `"Binary"` | Inferred from method | Underlying variable domain category. |
| `initialValue` | `number` | `undefined` | Optional primal solution hint (MIP start), kept distinct from solved `variable.value`. |

---

## Primal Initial Values (Warm-Start Hints)

When rebuilding a model across iterations with stable variable names, you can supply optional primal initial values (`initialValue`) on a subset or all numeric variables (`m.continuous`, `m.integer`, `m.binary`, or `v.initialValue = ...`):

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

- **Hint vs. Hard Constraint**: `initialValue` is strictly an optional solver hint (passed to HiGHS via `setSolution`). It does **not** fix the variable, add a constraint, or guarantee either solver acceptance or a runtime speedup. It remains separate from `variable.value` (which is `null` until solved and populated with the solver's primal solution).
- **Validation & Tolerance (`1e-6`)**: Supplied values must be finite numbers within `[lb - 1e-6, ub + 1e-6]` (and within `1e-6` of an integer inside bounds for `"Integer"` and `"Binary"` variables). Partial starts are not required to satisfy every model constraint.
- **Solver Support**: Supported by **HiGHS** (`capabilities.supportsWarmStart === true`). Solvers without warm-start support (**GLPK**, **Z3**, or custom adapters without `supportsWarmStart: true`) reject `solve()` and `check()` with a descriptive error rather than silently ignoring `initialValue`.

---

## Accessing Solution Values & Reduced Costs

After calling `await m.solve()` or `await m.check()`, optimal values are accessible via `variable.value` (returns `number | null` for `Var`, or `boolean | null` for `BoolVar`) or the bulk accessor `m.getValues()`:

```typescript
await m.solve();

// Single variable primal value
console.log(`trucks: ${trucks.value}`);

// Reduced cost (LP sensitivity analysis — how much an objective coefficient must improve before a variable at its bound enters the basis)
console.log(`fuel reduced cost: ${fuel.reducedCost}`);

// Bulk extraction for 1D or 2D collections (works for both Var and BoolVar collections)
const selectedValues = m.getValues(selected);
// { laptop: 1, phone: 0, tablet: 1 }

const flowValues = m.getValues(ship);
// { Tokyo: { StoreA: 50, ... }, Osaka: { ... } }
```

---

## Looking Up Variables by Name

You can retrieve registered decision variables by name or inspect the total variable count on the model:

```typescript
const v = m.getVarByName("trucks");           // Var | undefined
const b = m.getBoolVarByName("isNight");      // BoolVar | undefined
console.log("Total numeric variables:", m.numVars);
```
