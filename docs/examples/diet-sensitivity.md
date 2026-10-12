# Diet Problem & Sensitivity Analysis (LP Duals & Slacks)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Linear Programming (LP) | HiGHS (default) | `constr.dual`, `constr.slack`, `var.reducedCost` | [Open in Playground](https://ohtaman.github.io/washi/demo/?preset=diet_sensitivity) · [Source Code](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |

When solving a Linear Programming model, the optimal variable values (`var.value`) are only half the story. In practice, decision-makers need to know:

1. **Bottlenecks (`constr.dual` — Shadow Price):** Which minimum requirements are actively driving up the total cost, and by how much per unit?
2. **Surpluses (`constr.slack`):** Which constraints have room to spare?
3. **Reduced Costs (`var.reducedCost`):** For items not selected in the optimal plan, how much cheaper would they need to become before entering the solution?

This example formulates a classic nutritional diet problem and inspects all three sensitivity metrics returned by the HiGHS LP solver.

---

## Problem Inputs

We choose daily servings ($0 \le x_i \le 4$) among 6 food items to meet 4 daily nutritional minimums (`Calories >= 2000 kcal`, `Protein >= 105 g`, `Calcium >= 1000 mg`, `Iron >= 18 mg`) at minimum cost:

| Food Item | Cost / Serving | Calories (kcal) | Protein (g) | Calcium (mg) | Iron (mg) | Max Servings |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Oats** | $0.60 | 150 | 5 | 20 | 1.8 | 4.0 |
| **Chicken** | $2.40 | 220 | 32 | 15 | 1.2 | 4.0 |
| **Eggs** | $0.80 | 140 | 12 | 50 | 1.7 | 4.0 |
| **Milk** | $0.90 | 120 | 8 | 280 | 0.1 | 4.0 |
| **Spinach** | $1.50 | 40 | 4 | 120 | 3.5 | 4.0 |
| **Salmon** | $3.60 | 200 | 25 | 20 | 0.8 | 4.0 |

---

## Implementation in WaSHI

```typescript
import { Model, sum } from "@ohtaman/washi";

const foods = [
  { name: "Oats",    cost: 0.60, calories: 150, protein: 5,  calcium: 20,  iron: 1.8 },
  { name: "Chicken", cost: 2.40, calories: 220, protein: 32, calcium: 15,  iron: 1.2 },
  { name: "Eggs",    cost: 0.80, calories: 140, protein: 12, calcium: 50,  iron: 1.7 },
  { name: "Milk",    cost: 0.90, calories: 120, protein: 8,  calcium: 280, iron: 0.1 },
  { name: "Spinach", cost: 1.50, calories: 40,  protein: 4,  calcium: 120, iron: 3.5 },
  { name: "Salmon",  cost: 3.60, calories: 200, protein: 25, calcium: 20,  iron: 0.8 },
];

async function runDietSensitivity() {
  const m = new Model({ name: "DietSensitivity", sense: "Minimize" });

  // Continuous servings per day (0 to 4 servings max per food)
  const srv = m.addVars(foods.map((f) => f.name), { lb: 0, ub: 4, prefix: "srv" });

  // Objective: Minimize total daily cost
  m.minimize(sum(foods, (f) => srv[f.name].mul(f.cost)));

  // Keep references to Constraint objects to inspect .dual and .slack after solving
  const cCal  = m.addConstraint(sum(foods, (f) => srv[f.name].mul(f.calories)).ge(2000), "min_calories");
  const cProt = m.addConstraint(sum(foods, (f) => srv[f.name].mul(f.protein)).ge(105),   "min_protein");
  const cCalc = m.addConstraint(sum(foods, (f) => srv[f.name].mul(f.calcium)).ge(1000),  "min_calcium");
  const cIron = m.addConstraint(sum(foods, (f) => srv[f.name].mul(f.iron)).ge(18),       "min_iron");

  await m.solve();

  console.log(`Minimum Daily Cost: $${m.objectiveValue?.toFixed(2)}`);
  for (const f of foods) {
    const v = srv[f.name];
    console.log(`${f.name}: value=${v.value?.toFixed(2)}, reducedCost=${v.reducedCost?.toFixed(4)}`);
  }
  for (const c of [cCal, cProt, cCalc, cIron]) {
    console.log(`${c.name}: dual=$${c.dual?.toFixed(4)}, slack=${Math.abs(c.slack ?? 0).toFixed(2)}`);
  }
}

runDietSensitivity();
```

---

## Expected Output & Interpretation

```text
Status: Optimal
Minimum Daily Cost: $13.66

1. Food Basket & Reduced Costs (var.value, var.reducedCost):
Food      | Servings | Unit Cost | Reduced Cost | Interpretation
----------+----------+-----------+--------------+-------------------------------------------
Oats      |     4.00 |     $0.60 |     -1.3546 | At upper serving cap (4.0)
Chicken   |     1.55 |     $2.40 |     +0.0000 | In optimal menu
Eggs      |     4.00 |     $0.80 |     -1.0307 | At upper serving cap (4.0)
Milk      |     4.00 |     $0.90 |     -0.2294 | At upper serving cap (4.0)
Spinach   |     0.50 |     $1.50 |     +0.0000 | In optimal menu
Salmon    |     0.00 |     $3.60 |     +1.5125 | Needs -$1.51 price drop to enter menu

2. Nutritional Constraints & Shadow Prices (constr.dual, constr.slack):
Requirement      | Target |  Slack (Surplus) | Shadow Price (Dual) | Status
-----------------+--------+------------------+---------------------+--------------------
Calories (kcal)  | >= 2000|             0.00 |           $0.0091 | BINDING (Bottleneck)
Protein (g)      | >=  105|            46.46 |           $0.0000 | Non-binding (Surplus)
Calcium (mg)     | >= 1000|           483.02 |           $0.0000 | Non-binding (Surplus)
Iron (mg)        | >=   18|             0.00 |           $0.3241 | BINDING (Bottleneck)
```

### Key Takeaways
- **Binding Constraints (`slack == 0`, `dual > 0`):** Only `Calories` and `Iron` are tight at the optimum. Requiring 1 additional mg of Iron increases daily food cost by **$0.3241**.
- **Non-Binding Constraints (`slack > 0`, `dual == 0`):** The optimal menu already provides `151.46 g` of Protein (`+46.46 g` surplus over the `105 g` target) and `1483 mg` of Calcium (`+483 mg` surplus). Slightly tightening those requirements costs **$0**.
- **Reduced Cost (`Salmon`):** Because Salmon has `reducedCost = +1.5125`, its price per serving would need to drop by at least **$1.51** (from `$3.60` down to `$2.09`) before it replaces Chicken/Spinach in the optimal diet.
