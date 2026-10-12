# Variables & Domains

Variables represent the mathematical decision variables in your optimization model.
WaSHI provides domain-specific factory methods on the `Model` instance: `m.continuous()`, `m.integer()`, and `m.binary()`.

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
Restricted to $\{0, 1\}$. Ideal for yes/no decisions, logical toggles, and facility selections:

```typescript
// Single binary variable
const openWarehouse = m.binary("open_warehouse");
// lb is automatically 0, ub is automatically 1
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
m.constrain(expr`${batch} >= 10 * ${isActive}`, "min_batch_run");
m.constrain(expr`${batch} <= 100 * ${isActive}`, "max_batch_run");
```

---

## Multi-Dimensional & Array Creation

The same factory methods (`continuous`, `integer`, `binary`) support arrays of keys to create 1D dictionaries and multi-dimensional matrices in a single call.

### 1D Variable Dictionaries
Pass an array of keys to get a typed dictionary `Record<string, Var>`:

```typescript
const items = ["laptop", "phone", "tablet"];

// Record<"laptop" | "phone" | "tablet", Var>
const selected = m.binary(items);

// Access via key:
// selected["laptop"]
```

### 2D Variable Matrices
Pass row keys and column keys to create a 2D matrix `Record<string, Record<string, Var>>`:

```typescript
const factories = ["Tokyo", "Osaka"];
const stores = ["StoreA", "StoreB", "StoreC"];

// ship[factory][store]
const ship = m.continuous(factories, stores, { lb: 0 });

// Combine with dot product:
// dot(costMatrix, ship)
```

---

## Propositional Boolean Variables (`m.addBoolVar`)

For SMT / SAT propositional logic rules and satisfiability checking with Z3:

```typescript
const isNight = m.addBoolVar("isNight");
const alarmTriggered = m.addBoolVar("alarmTriggered");

// First-class boolean operators: and, or, not, implies, xor
m.constrain(alarmTriggered.implies(isNight), "alarm_policy");
```

---

## Variable Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `lb` | `number` | `0` | Lower bound. Defaults to 0 (non-negative). |
| `ub` | `number` | `Infinity` (or `1` for binary) | Upper bound. |
| `type` | `"Continuous"` \| `"Integer"` \| `"Binary"` | Inferred from method | Underlying variable domain category. |

---

## Accessing Solution Values

After calling `await m.optimize()`, optimal values are accessible via `variable.value` or the bulk accessor `m.getValues()`:

```typescript
await m.optimize();

// Single variable
console.log(`trucks: ${trucks.value}`);

// Bulk extraction for 1D or 2D collections
const selectedValues = m.getValues(selected);
// { laptop: 1, phone: 0, tablet: 1 }

const flowValues = m.getValues(ship);
// { Tokyo: { StoreA: 50, ... }, Osaka: { ... } }
```
