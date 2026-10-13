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

import { Model, expr, c, minimize } from "../../src/index.js";
// In your application, import: import "@ohtaman/washi/solvers/glpk";
import "../../src/modeler/solvers/glpk.js";

async function main() {
  console.log("=== GLPK Solver Plugin Example ===");

  const model = new Model({ name: "DietProblem", solver: "glpk" });

  // Food variables with unit costs
  const bread = model.continuous("bread", { lb: 0, ub: 10 });     // $2.00 / loaf
  const milk = model.continuous("milk", { lb: 0, ub: 10 });       // $3.50 / bottle
  const cheese = model.continuous("cheese", { lb: 0, ub: 5 });    // $5.00 / pack

  // Objective: Minimize total cost
  model.objective(minimize(expr`2 * ${bread} + 3.5 * ${milk} + 5 * ${cheese}`));

  // Nutritional requirements:
  // Calories >= 2000, Protein >= 70g, Calcium >= 800mg
  model.constraint(c`300 * ${bread} + 250 * ${milk} + 400 * ${cheese} >= 2000`, "Calories")
       .constraint(c`10 * ${bread} + 15 * ${milk} + 25 * ${cheese} >= 70`, "Protein")
       .constraint(c`50 * ${bread} + 300 * ${milk} + 500 * ${cheese} >= 800`, "Calcium");

  console.log("Solving with GLPK...");
  const status = await model.solve();

  console.log(`Status: ${status}`);
  console.log(`Optimal Cost: $${model.objectiveValue?.toFixed(2)}`);
  console.log(`Bread:  ${bread.value?.toFixed(2)} loaves`);
  console.log(`Milk:   ${milk.value?.toFixed(2)} bottles`);
  console.log(`Cheese: ${cheese.value?.toFixed(2)} packs`);

  console.log("\nShadow Prices (Duals):");
  console.log(`Calories dual: ${model.getConstraintByName("Calories")?.dual?.toFixed(4)}`);
  console.log(`Protein dual:  ${model.getConstraintByName("Protein")?.dual?.toFixed(4)}`);
  console.log(`Calcium dual:  ${model.getConstraintByName("Calcium")?.dual?.toFixed(4)}`);
}

main().catch(console.error);
