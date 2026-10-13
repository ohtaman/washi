/**
 * Example 2: 0-1 Knapsack Problem (Mixed-Integer Programming)
 * 
 * Demonstrates:
 * - Binary decision variables
 * - Array-based dynamic modeling using classical sum() helper
 * - High-speed MIP solving via HiGHS
 * 
 * Run with: npx tsx examples/node/02-knapsack-problem.ts
 */

import { Model, dot, maximize } from "../../src/index.js";

async function main() {
  console.log("=== 0-1 Knapsack Optimization (MIP) ===");

  const m = new Model("Knapsack");

  const items = [
    { name: "Laptop", weight: 3, value: 50 },
    { name: "Camera", weight: 2, value: 40 },
    { name: "Drone", weight: 4, value: 65 },
    { name: "FirstAid", weight: 1, value: 15 },
    { name: "Tent", weight: 5, value: 70 },
  ];
  const maxCapacity = 7; // kg

  // Binary variable: x[i] = 1 if item packed, 0 otherwise
  const x = m.binary(items.map((it) => it.name));

  const values = Object.fromEntries(items.map((it) => [it.name, it.value]));
  const weights = Object.fromEntries(items.map((it) => [it.name, it.weight]));

  // Objective: Maximize total value of packed items via dot product
  m.objective(maximize(dot(values, x)));

  // Capacity constraint: total weight <= maxCapacity using dot product and constraint()
  m.constraint(dot(weights, x).le(maxCapacity), "capacity_limit");

  const status = await m.solve();

  console.log(`\nStatus: ${status}`);
  console.log(`Max Total Value: $${m.objectiveValue}`);
  console.log("Packed Items:");
  let totalWeight = 0;
  for (const it of items) {
    if (x[it.name].value === 1) {
      console.log(`  • ${it.name} (weight: ${it.weight}kg, value: $${it.value})`);
      totalWeight += it.weight;
    }
  }
  console.log(`Total Weight: ${totalWeight}kg / ${maxCapacity}kg`);
  console.log("All Solution Values:", m.getValues(x));
}

main().catch(console.error);
