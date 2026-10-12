# Diet Problem & Sensitivity Analysis (LP Duals & Slacks)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Linear Programming (LP) | HiGHS (default) | `constr.dual`, `constr.slack`, `var.reducedCost` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=diet_sensitivity">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts">Source Code</a></li></ul> |

When solving a Linear Programming model, the optimal variable values (`var.value`) are only half the story. In practice, decision-makers need to know:

1. **Bottlenecks (`constr.dual` — Shadow Price):** Which minimum requirements are actively driving up the total cost, and by how much per unit?
2. **Surpluses (`constr.slack`):** Which constraints have room to spare?
3. **Reduced Costs (`var.reducedCost`):** For items not selected in the optimal plan, how much cheaper would they need to become before entering the solution?

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

## Implementation in WaSHI

<CodeRunner preset="diet_sensitivity">

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

  const status = await m.solve();

  console.log(`Status: ${status}, Minimum Daily Cost: $${m.objectiveValue?.toFixed(2)}`);
  console.log("--- Food Servings & Reduced Costs ---");
  for (const f of foods) {
    const v = srv[f.name];
    console.log(`  ${f.name.padEnd(8)}: value=${v.value?.toFixed(2)}, reducedCost=${v.reducedCost?.toFixed(4)}`);
  }
  console.log("--- Nutritional Constraints (Dual & Slack) ---");
  for (const c of [cCal, cProt, cCalc, cIron]) {
    console.log(`  ${c.name.padEnd(13)}: dual=$${c.dual?.toFixed(4)}, slack=${Math.abs(c.slack ?? 0).toFixed(2)}`);
  }
}

runDietSensitivity();
```

</CodeRunner>
