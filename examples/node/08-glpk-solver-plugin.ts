/**
 * Example 8: GLPK Solver Plugin (GNU Linear Programming Kit)
 * 
 * Demonstrates:
 * - Importing the optional GLPK solver plugin
 * - Solving LP / MIP problems via GLPK engine
 * - Inspecting dual values and solver runtime
 * 
 * Run with: npx tsx examples/node/08-glpk-solver-plugin.ts
 */

import { Model } from "../../src/index.js";
// In your application, import: import "@ohtaman/washi/solvers/glpk";
import "../../src/modeler/solvers/glpk.js";

async function main() {
  console.log("=== GLPK Solver Plugin Example ===");

  const model = new Model({ name: "DietProblem", sense: "Minimize", solver: "glpk" });

  // Food variables with unit costs
  const bread = model.addVar({ name: "bread", lb: 0, ub: 10 });     // $2.00 / loaf
  const milk = model.addVar({ name: "milk", lb: 0, ub: 10 });       // $3.50 / bottle
  const cheese = model.addVar({ name: "cheese", lb: 0, ub: 5 });    // $5.00 / pack

  // Objective: Minimize total cost
  model.minimize(bread.mul(2.0).add(milk.mul(3.5)).add(cheese.mul(5.0)));

  // Nutritional requirements:
  // Calories >= 2000
  const cCalories = model.addConstraint(
    bread.mul(300).add(milk.mul(250)).add(cheese.mul(400)).ge(2000),
    "Calories"
  );

  // Protein >= 70g
  const cProtein = model.addConstraint(
    bread.mul(10).add(milk.mul(15)).add(cheese.mul(25)).ge(70),
    "Protein"
  );

  // Calcium >= 800mg
  const cCalcium = model.addConstraint(
    bread.mul(50).add(milk.mul(300)).add(cheese.mul(500)).ge(800),
    "Calcium"
  );

  console.log("Solving with GLPK...");
  const status = await model.optimize();

  console.log(`Status: ${status}`);
  console.log(`Optimal Cost: $${model.objectiveValue?.toFixed(2)}`);
  console.log(`Bread:  ${bread.value?.toFixed(2)} loaves`);
  console.log(`Milk:   ${milk.value?.toFixed(2)} bottles`);
  console.log(`Cheese: ${cheese.value?.toFixed(2)} packs`);

  console.log("\nShadow Prices (Duals):");
  console.log(`Calories dual: ${cCalories.dual?.toFixed(4)}`);
  console.log(`Protein dual:  ${cProtein.dual?.toFixed(4)}`);
  console.log(`Calcium dual:  ${cCalcium.dual?.toFixed(4)}`);
}

main().catch(console.error);
