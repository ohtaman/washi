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

import { Model, sum } from "../../src/index.js";

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
  const x = m.addVars(
    items.map((it) => it.name),
    { type: "Binary" }
  );

  // Objective: Maximize total value of packed items
  m.maximize(sum(items.map((it) => x[it.name].mul(it.value))));

  // Capacity constraint: total weight <= maxCapacity
  m.addConstraint(
    sum(items.map((it) => x[it.name].mul(it.weight))).le(maxCapacity),
    "capacity_limit"
  );

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
}

main().catch(console.error);
