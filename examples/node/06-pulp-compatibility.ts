/**
 * Example 6: PuLP Compatible Modeling (LpProblem, LpVariable, lpSum)
 * 
 * Demonstrates:
 * - 1:1 drop-in syntax for Python PuLP users
 * - High-speed in-process WASM solving without external solver binaries
 * 
 * Run with: npx tsx examples/node/06-pulp-compatibility.ts
 */

import {
  LpProblem,
  LpVariable,
  LpMaximize,
  LpInteger,
  lpSum,
  value,
} from "../../src/index.js";

async function main() {
  console.log("=== PuLP Drop-in Compatible Modeling ===");

  // Create problem with PuLP syntax
  const prob = new LpProblem("DietProblem", LpMaximize);

  // Define decision variables
  const foodA = new LpVariable("Food_A", 0, undefined, LpInteger);
  const foodB = new LpVariable("Food_B", 0, undefined, LpInteger);

  // Objective: Maximize satisfaction
  prob.setObjective(foodA.mul(2).add(foodB.mul(3)));

  // Add constraints
  prob.addConstraint(foodA.mul(1).add(foodB.mul(2)).le(10), "Calories");
  prob.addConstraint(foodA.mul(3).add(foodB.mul(1)).le(15), "Protein");

  console.log("Solving with PuLP-compatible API...");
  const status = await prob.solve();

  console.log(`\nStatus: ${status}`);
  console.log(`Optimal Objective Value: ${prob.objectiveValue}`);
  console.log(`  Food_A: ${value(foodA)}`);
  console.log(`  Food_B: ${value(foodB)}`);
}

main().catch(console.error);
