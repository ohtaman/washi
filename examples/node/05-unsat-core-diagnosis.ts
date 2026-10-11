/**
 * Example 5: Conflict Diagnosis with Unsat Core Extraction (Z3)
 * 
 * Demonstrates:
 * - Detecting mutually incompatible constraints in business logic
 * - Extracting a conflicting constraint subset (unsatCore)
 * 
 * Run with: npx tsx examples/node/05-unsat-core-diagnosis.ts
 */

import { Model } from "../../src/index.js";
import { registerZ3Solver } from "../../src/modeler/solvers/z3.js";

async function main() {
  console.log("=== Conflict Diagnosis & Unsat Core Extraction (Z3) ===");

  registerZ3Solver();

  const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });

  const engineers = m.addVar({ name: "engineers", type: "Integer", lb: 0, ub: 20 });
  const budget = m.addVar({ name: "budget", type: "Continuous", lb: 0, ub: 100000 });
  const rushDelivery = m.addBoolVar("rushDelivery");

  // Rule 1: Each engineer costs $8,000
  m.addConstraint(engineers.mul(8000).le(budget), "budget_limit");

  // Rule 2: Customer requires rush delivery
  m.addConstraint(rushDelivery, "rush_required");

  // Rule 3: Rush delivery requires at least 8 engineers
  m.addConstraint(rushDelivery.implies(engineers.ge(8)), "rush_staffing_rule");

  // Rule 4: Hard board budget cap of $50,000 (Conflict: 8 * $8000 = $64,000 > $50,000!)
  m.addConstraint(budget.le(50000), "strict_board_budget_cap");

  // Rule 5: Minimum 1 employee regulation (innocent bystander rule)
  m.addConstraint(engineers.ge(1), "minimum_one_employee");

  console.log("Diagnosing constraint feasibility...");
  const res = await m.check({ solver: "z3" });

  console.log(`\nStatus: ${res.status}`);

  if (res.status === "Unsat") {
    console.log("\n⚠️ Incompatible Constraint Core (Minimal Conflict):");
    m.unsatCore.forEach((ruleName) => {
      console.log(`  ❌ ${ruleName}`);
    });
  }
}

main().catch(console.error);
