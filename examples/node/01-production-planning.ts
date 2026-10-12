/**
 * Example 1: Production Planning (Linear Programming)
 * 
 * Demonstrates:
 * - Basic Model definition
 * - Tagged Template Literal syntax (c`...` and expr`...`)
 * - Solving with default HiGHS WASM solver
 * 
 * Run with: npx tsx examples/node/01-production-planning.ts
 */

import { Model, expr } from "../../src/index.js";

async function main() {
  console.log("=== Production Planning Optimization (LP) ===");

  const m = new Model("FactoryProduction");

  // Decision variables: Number of chairs and tables to produce
  const chairs = m.integer("chairs", { lb: 0 });
  const tables = m.integer("tables", { lb: 0 });

  // Objective: Maximize profit ($45/chair, $80/table)
  m.maximize(expr`45 * ${chairs} + 80 * ${tables}`);

  // Resource Constraints via Tagged Template Literals and fluent constrain():
  // Mahogany wood: 5 sq ft per chair, 20 sq ft per table <= 400 sq ft
  // Carpentry labor: 10 hrs per chair, 15 hrs per table <= 450 hrs
  m.constrain(expr`5 * ${chairs} + 20 * ${tables} <= 400`, "mahogany_limit")
   .constrain(expr`10 * ${chairs} + 15 * ${tables} <= 450`, "labor_limit");

  console.log("Solving with default HiGHS WebAssembly solver...");
  const status = await m.optimize();

  console.log(`\nStatus: ${status}`);
  console.log(`Optimal Profit: $${m.objectiveValue}`);
  console.log(`  Chairs: ${chairs.value}`);
  console.log(`  Tables: ${tables.value}`);
}

main().catch(console.error);
