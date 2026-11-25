# Diet Problem & Sensitivity Analysis (LP Duals & Slacks)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Linear Programming (LP) | HiGHS (default) | `m.continuous()`, `m.constraint()`, `constr.dual`, `constr.slack`, `var.reducedCost` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=diet_sensitivity">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts">Source Code</a></li></ul> |

After solving a Linear Programming (LP) model, **sensitivity analysis** shows how the optimal cost responds to changes in requirements, caps, or unit prices:

1. **Shadow Price (`constr.dual`):** Marginal change in optimal cost when a constraint's right-hand side increases by 1 unit.
2. **Slack (`constr.slack`):** Spare margin (or surplus) on a constraint, where `0` means the constraint is binding.
3. **Reduced Cost (`var.reducedCost`):** Marginal change in optimal cost when a variable fixed at its lower or upper bound is increased by 1 unit.

## Problem Inputs

We determine daily servings ($0 \le x_i \le 4$, continuous) for each of 6 foods to minimize daily cost. The plan must meet 4 daily minimums: at least `2000 kcal` of calories, `105 g` of protein, `1000 mg` of calcium, and `18 mg` of iron.

| Food Item | Cost / Serving | Calories (kcal) | Protein (g) | Calcium (mg) | Iron (mg) | Max Servings |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Oats** | $0.60 | 150 | 5 | 20 | 1.8 | 4.0 |
| **Chicken** | $2.40 | 220 | 32 | 15 | 1.2 | 4.0 |
| **Eggs** | $0.80 | 140 | 12 | 50 | 1.7 | 4.0 |
| **Milk** | $0.90 | 120 | 8 | 280 | 0.1 | 4.0 |
| **Spinach** | $1.50 | 40 | 4 | 120 | 3.5 | 4.0 |
| **Salmon** | $3.60 | 200 | 25 | 20 | 0.8 | 4.0 |

## Implementation in WaSHI

<CodeRunner preset="diet_sensitivity">

```typescript
import { Model, minimize, expr } from "@ohtaman/washi";

const foods = [
  { name: "Oats",    cost: 0.60, calories: 150, protein: 5,  calcium: 20,  iron: 1.8 },
  { name: "Chicken", cost: 2.40, calories: 220, protein: 32, calcium: 15,  iron: 1.2 },
  { name: "Eggs",    cost: 0.80, calories: 140, protein: 12, calcium: 50,  iron: 1.7 },
  { name: "Milk",    cost: 0.90, calories: 120, protein: 8,  calcium: 280, iron: 0.1 },
  { name: "Spinach", cost: 1.50, calories: 40,  protein: 4,  calcium: 120, iron: 3.5 },
  { name: "Salmon",  cost: 3.60, calories: 200, protein: 25, calcium: 20,  iron: 0.8 },
];

async function runDietSensitivity() {
  const m = new Model("DietSensitivity");

  // Continuous servings per day (0 to 4 servings per food)
  const srv = m.continuous(foods.map((f) => f.name), { lb: 0, ub: 4 });

  const costs = Object.fromEntries(foods.map((f) => [f.name, f.cost]));
  const cals  = Object.fromEntries(foods.map((f) => [f.name, f.calories]));
  const prots = Object.fromEntries(foods.map((f) => [f.name, f.protein]));
  const calcs = Object.fromEntries(foods.map((f) => [f.name, f.calcium]));
  const irons = Object.fromEntries(foods.map((f) => [f.name, f.iron]));

  // Objective: Minimize total daily cost
  m.objective(minimize(expr`dot(${costs}, ${srv})`));

  // Nutritional minimum constraints
  const nutConstraints = [
    m.constraint(expr`dot(${cals}, ${srv}) >= 2000`, "min_calories"),
    m.constraint(expr`dot(${prots}, ${srv}) >= 105`,  "min_protein"),
    m.constraint(expr`dot(${calcs}, ${srv}) >= 1000`, "min_calcium"),
    m.constraint(expr`dot(${irons}, ${srv}) >= 18`,   "min_iron"),
  ];

  const status = await m.solve();

  console.log(`Status: ${status}, Minimum Daily Cost: $${m.objectiveValue?.toFixed(2)}`);
  console.log("--- Food Servings & Reduced Costs ---");
  for (const f of foods) {
    const v = srv[f.name];
    console.log(`  ${f.name.padEnd(8)}: value=${v.value?.toFixed(2)}, reducedCost=${v.reducedCost?.toFixed(4)}`);
  }
  console.log("--- Nutritional Constraints (Dual & Slack) ---");
  for (const c of nutConstraints) {
    console.log(`  ${c.name.padEnd(13)}: dual=$${c.dual?.toFixed(4)}, slack=${Math.abs(c.slack ?? 0).toFixed(2)}`);
  }
}

runDietSensitivity();
```

</CodeRunner>

## Interpretation of Results

HiGHS returns `"Optimal"` with a minimum daily cost of **`$13.66`** (`Oats`, `Eggs`, and `Milk` at `4.00` servings each, `Chicken` at `1.55`, `Spinach` at `0.50`, and `Salmon` at `0.00`).

### Bottleneck Constraints (`slack == 0`, `dual > 0`)

Both `min_calories` and `min_iron` are binding at their lower bounds, with `dual = $0.0091/kcal` for calories and `dual = $0.3241/mg` for iron. Raising the daily iron target by `1 mg` increases the minimum daily cost by `$0.3241`.

### Constraints with Surplus (`|slack| > 0`, `dual == 0`)

For `>=` constraints, HiGHS reports `slack` as `rhs - lhs`, returning negative values (`-46.46` for protein and `-483.02` for calcium). The code prints `Math.abs(c.slack)` as the surplus (`46.46 g` of protein and `483.02 mg` of calcium). Because both targets have spare room, their shadow prices are `0`.

### Reduced Cost at the Lower Bound (`Salmon`)

`Salmon` is unselected (`value = 0.00`) with `reducedCost = +1.5125`. Its price per serving would need to drop by at least `$1.5125` (about `$1.51`) before entering the optimal menu.

### Negative Reduced Cost at the Upper Bound (`Oats`, `Eggs`, `Milk`)

Three foods hit the daily cap of `ub = 4.0`. In a minimization LP, an upper-bounded variable has a non-positive reduced cost, indicating the marginal cost change per unit increase in `ub` (its magnitude is the saving per added serving):

- `Oats`: `reducedCost = -1.3546` (raising `ub` by 1 serving saves about `$1.35/day`)
- `Eggs`: `reducedCost = -1.0307` (raising `ub` by 1 serving saves about `$1.03/day`)
- `Milk`: `reducedCost = -0.2294` (raising `ub` by 1 serving saves about `$0.23/day`)

### Basis Stability Range

Both `dual` and `reducedCost` are local marginal rates valid within the current optimal simplex basis. If a bound or right-hand side changes enough to switch which constraints or bounds are active, these marginal rates shift to new values.
