# Variables & Bounds

Variables are the decision variables of your mathematical optimization problem. In WaSHI, variables are created and tracked by an instance of `Model`.

---

## Defining Variables

Call `model.addVar(options)` to add a single decision variable:

```typescript
import { Model } from "@ohtaman/washi";

const model = new Model();

// Create a continuous variable bounded between 0 and 100
const x = model.addVar({
  type: "Continuous",
  lb: 0,
  ub: 100,
  name: "production_volume",
});
```

### Variable Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `type` | `"Continuous"` \| `"Integer"` \| `"Binary"` \| `"SemiContinuous"` | `"Continuous"` | Category of the variable. |
| `lb` | `number` | `0` | Lower bound. Defaults to 0 (non-negative). |
| `ub` | `number` | `Infinity` | Upper bound. |
| `name` | `string` | Auto-generated (`x1`, `x2`, ...) | Variable identifier name for exports and debugging. |

---

## Variable Types

### 1. Continuous Variables
Can take any real number value within `[lb, ub]`. Ideal for physical quantities (liters, hours, dollars):

```typescript
const fuel = model.addVar({ type: "Continuous", lb: 0, ub: 1000 });
```

### 2. Integer Variables
Restricted to whole integer values. Ideal for countable assets (machines, trucks, staff):

```typescript
const trucks = model.addVar({ type: "Integer", lb: 0, ub: 15 });
```

### 3. Binary Variables (0 or 1)
Restricted to either `0` or `1`. Ideal for yes/no decisions, logical switches, and facility opening:

```typescript
const openWarehouse = model.addVar({ type: "Binary", name: "open_warehouse" });
// lb is automatically 0, ub is automatically 1
```

### 4. Semi-Continuous Variables
Can either be `0`, or take a value within `[lb, ub]`. Useful for minimum batch production constraints:

```typescript
const batch = model.addVar({
  type: "SemiContinuous",
  lb: 10, // Must produce at least 10 if active
  ub: 100,
});
```

---

## Batch Creation (`model.addVars`)

To create arrays or matrices of variables conveniently:

```typescript
// Create an array of 5 binary variables
const selections = Array.from({ length: 5 }, (_, i) =>
  model.addVar({ type: "Binary", name: `item_${i}` })
);

// Create a 3x3 matrix of continuous variables
const flow = Array.from({ length: 3 }, (_, i) =>
  Array.from({ length: 3 }, (_, j) =>
    model.addVar({ lb: 0, name: `flow_${i}_${j}` })
  )
);
```

---

## Accessing Solution Values

After calling `await model.solve()`, the optimal value of each variable is accessible through `variable.value`:

```typescript
await model.solve();

console.log(`x value: ${x.value}`);
console.log(`Open warehouse? ${openWarehouse.value === 1 ? "Yes" : "No"}`);
```
