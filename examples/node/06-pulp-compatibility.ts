/**
 * Example 6: Domain-pure Modern Algebraic Modeling
 * 
 * Demonstrates:
 * - Direct mathematical modeling with Model, integer/continuous/binary
 * - First-class constrain() method and inner product (dot)
 * - Clean solution extraction with getValues()
 * 
 * Run with: npx tsx examples/node/06-pulp-compatibility.ts
 */

import {
  Model,
  dot,
  expr,
} from "../../src/index.js";

async function main() {
  console.log("=== Domain-Pure Algebraic Modeling ===");

  const m = new Model("DietProblem");

  // Define decision variables domain-directly
  const foodA = m.integer("Food_A", { lb: 0 });
  const foodB = m.integer("Food_B", { lb: 0 });

  // Objective: Maximize satisfaction (2 * foodA + 3 * foodB)
  m.maximize(expr`2 * ${foodA} + 3 * ${foodB}`);

  // Add constraints using the primary constrain() method
  m.constrain(expr`${foodA} + 2 * ${foodB} <= 10`, "Calories")
   .constrain(expr`3 * ${foodA} + ${foodB} <= 15`, "Protein");

  console.log("Optimizing with HiGHS...");
  const status = await m.optimize();

  console.log(`\nStatus: ${status}`);
  console.log(`Optimal Objective Value: ${m.objectiveValue}`);
  console.log(`  Food_A: ${foodA.value}`);
  console.log(`  Food_B: ${foodB.value}`);
  console.log(`  Values:`, m.getValues([foodA, foodB]));
}

main().catch(console.error);

