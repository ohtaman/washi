/**
 * Example 10: Diet Problem & Sensitivity Analysis (LP Duals, Slacks, Reduced Costs)
 *
 * Demonstrates:
 * - Inspecting constraint shadow prices (`constr.dual`) to see which nutritional
 *   requirements drive the cost
 * - Inspecting constraint slacks (`constr.slack`) to distinguish binding constraints
 *   from constraints with surplus
 * - Inspecting variable reduced costs (`v.reducedCost`) to see how much cheaper an
 *   unselected food item must become before entering the optimal menu
 *
 * Solver: HiGHS (default LP engine)
 * Run with: npx tsx examples/node/10-diet-sensitivity.ts
 */

import { Model, sum } from "../../src/index.js";

interface FoodItem {
  name: string;
  cost: number;      // $ per serving
  calories: number;  // kcal
  protein: number;   // g
  calcium: number;   // mg
  iron: number;      // mg
}

const foods: FoodItem[] = [
  { name: "Oats",    cost: 0.60, calories: 150, protein: 5,  calcium: 20,  iron: 1.8 },
  { name: "Chicken", cost: 2.40, calories: 220, protein: 32, calcium: 15,  iron: 1.2 },
  { name: "Eggs",    cost: 0.80, calories: 140, protein: 12, calcium: 50,  iron: 1.7 },
  { name: "Milk",    cost: 0.90, calories: 120, protein: 8,  calcium: 280, iron: 0.1 },
  { name: "Spinach", cost: 1.50, calories: 40,  protein: 4,  calcium: 120, iron: 3.5 },
  { name: "Salmon",  cost: 3.60, calories: 200, protein: 25, calcium: 20,  iron: 0.8 },
];

async function main() {
  console.log("=== Diet Problem & LP Sensitivity Analysis ===");
  const t0 = performance.now();

  const m = new Model({ name: "DietSensitivity", sense: "Minimize" });

  // Continuous decision variables: daily servings of each food (0 to 4 servings)
  const servings = m.addVars(
    foods.map((f) => f.name),
    { lb: 0, ub: 4, type: "Continuous", prefix: "srv" }
  );

  // Objective: Minimize total daily food cost
  m.minimize(sum(foods, (f) => servings[f.name].mul(f.cost)));

  // Daily nutritional minimum requirements
  const requirements = [
    {
      name: "min_calories",
      label: "Calories (kcal)",
      rhs: 2000,
      constr: m.addConstraint(
        sum(foods, (f) => servings[f.name].mul(f.calories)).ge(2000),
        "min_calories"
      ),
    },
    {
      name: "min_protein",
      label: "Protein (g)",
      rhs: 105,
      constr: m.addConstraint(
        sum(foods, (f) => servings[f.name].mul(f.protein)).ge(105),
        "min_protein"
      ),
    },
    {
      name: "min_calcium",
      label: "Calcium (mg)",
      rhs: 1000,
      constr: m.addConstraint(
        sum(foods, (f) => servings[f.name].mul(f.calcium)).ge(1000),
        "min_calcium"
      ),
    },
    {
      name: "min_iron",
      label: "Iron (mg)",
      rhs: 18,
      constr: m.addConstraint(
        sum(foods, (f) => servings[f.name].mul(f.iron)).ge(18),
        "min_iron"
      ),
    },
  ];

  const buildMs = performance.now() - t0;
  const status = await m.solve();
  const solveMs = m.runTime * 1000;

  console.log(`\nStatus: ${status} (model build: ${buildMs.toFixed(2)}ms, solve: ${solveMs.toFixed(2)}ms)`);
  console.log(`Minimum Daily Cost: $${m.objectiveValue?.toFixed(2)}\n`);

  // 1. Variable Primal Values & Reduced Costs
  console.log("1. Food Basket & Reduced Costs (var.value, var.reducedCost):");
  console.log("Food      | Servings | Unit Cost | Reduced Cost | Interpretation");
  console.log("----------+----------+-----------+--------------+-------------------------------------------");
  for (const f of foods) {
    const v = servings[f.name];
    const val = v.value ?? 0;
    const rc = v.reducedCost ?? 0;
    let note = "In optimal menu";
    if (val < 1e-5 && rc > 1e-5) {
      note = `Needs -$${rc.toFixed(2)} price drop to enter menu`;
    } else if (Math.abs(val - 4) < 1e-5) {
      note = "At upper serving cap (4.0)";
    }
    console.log(
      `${f.name.padEnd(10)}| ${val.toFixed(2).padStart(8)} |     $${f.cost.toFixed(2)} |     ${rc >= 0 ? "+" : ""}${rc.toFixed(4)} | ${note}`
    );
  }

  // 2. Constraint Shadow Prices (Duals) & Slacks
  console.log("\n2. Nutritional Constraints & Shadow Prices (constr.dual, constr.slack):");
  console.log("Requirement      | Target |  Slack (Surplus) | Shadow Price (Dual) | Status");
  console.log("-----------------+--------+------------------+---------------------+--------------------");
  for (const req of requirements) {
    const slack = Math.abs(req.constr.slack ?? 0);
    const dual = req.constr.dual ?? 0;
    const isBinding = slack < 1e-4;
    const statusText = isBinding ? "BINDING (Bottleneck)" : "Non-binding (Surplus)";
    console.log(
      `${req.label.padEnd(17)}| >= ${String(req.rhs).padStart(4)}| ${slack.toFixed(2).padStart(16)} |           $${dual.toFixed(4)} | ${statusText}`
    );
  }
}

main().catch(console.error);
