import { Model, sum } from "../../src/index.js";
import { Z3Solver } from "../../src/modeler/solvers/z3.js";

/**
 * 07-hybrid-smt-mip.ts
 *
 * Demonstrates the Hybrid SMT + MIP Architecture:
 * 1. Diagnostic Step (Z3 SMT): Verify satisfiability of discrete business rules
 *    and ensure no logical deadlocks exist before committing to optimization.
 * 2. Optimization Step (HiGHS MIP): Use Big-M auto-linearization (`addIndicator`)
 *    to find the optimal continuous capacity and resource allocation with zero configuration.
 */
async function run() {
  console.log("=== Hybrid Optimization: SMT Verification -> HiGHS MIP Solving ===\n");

  // -------------------------------------------------------------
  // Step 1: Logical Satisfiability & Invariant Check using Z3 SMT
  // -------------------------------------------------------------
  console.log("Step 1: Checking propositional policy feasibility with Z3...");
  const policyModel = new Model({ name: "CloudDeploymentPolicy", solver: new Z3Solver() });

  const deployEurope = policyModel.addBoolVar("deployEurope");
  const deployUS = policyModel.addBoolVar("deployUS");
  const complianceGDPR = policyModel.addBoolVar("complianceGDPR");
  const budgetTierHigh = policyModel.addBoolVar("budgetTierHigh");

  // Rule 1: Europe requires GDPR compliance: deployEurope -> complianceGDPR
  policyModel.addConstraint(deployEurope.implies(complianceGDPR), "r1_gdpr");

  // Rule 2: Multi-region deployment requires high budget tier: (deployEurope & deployUS) -> budgetTierHigh
  policyModel.addConstraint(deployEurope.and(deployUS).implies(budgetTierHigh), "r2_budget");

  // Scenario: We want both regions deployed, but budget is high and GDPR is enabled
  policyModel.addConstraint(deployEurope);
  policyModel.addConstraint(deployUS);
  policyModel.addConstraint(budgetTierHigh);
  policyModel.addConstraint(complianceGDPR);

  const policyFeasible = await policyModel.check();
  console.log(`SMT Check Result: ${policyFeasible ? "SAT (Feasible & Consistent)" : "UNSAT"}`);

  if (!policyFeasible) {
    console.error("Policy rules are inconsistent! Halting optimization pipeline.");
    return;
  }

  // -------------------------------------------------------------
  // Step 2: High-Performance Numerical Optimization with HiGHS MIP
  // -------------------------------------------------------------
  console.log("\nStep 2: Solving resource allocation & fixed-charge MIP with HiGHS...");
  const mip = new Model({ name: "DataCenterCapacityAllocation" });

  // Continuous traffic capacity in TB/s
  const capEU = mip.addVar({ name: "capEU", lb: 0, ub: 500 });
  const capUS = mip.addVar({ name: "capUS", lb: 0, ub: 500 });

  // Binary activation decisions
  const openEU = mip.addVar({ name: "openEU", type: "Binary" });
  const openUS = mip.addVar({ name: "openUS", type: "Binary" });

  // Big-M Indicator Constraints:
  // If openEU == 0 -> capEU <= 0 (cannot route traffic if cluster is offline)
  // If openUS == 0 -> capUS <= 0
  mip.addIndicator(openEU, capEU.le(0), { activeValue: 0, M: 500, name: "eu_offline" });
  mip.addIndicator(openUS, capUS.le(0), { activeValue: 0, M: 500, name: "us_offline" });

  // Minimum activation batch (at least 50 TB/s if activated)
  mip.addIndicator(openEU, capEU.ge(50), { activeValue: 1, M: 500, name: "eu_min_batch" });
  mip.addIndicator(openUS, capUS.ge(50), { activeValue: 1, M: 500, name: "us_min_batch" });

  // Demand requirement: total traffic >= 450 TB/s
  mip.add(capEU.add(capUS).ge(450), "total_demand");

  // Objective: Minimize Operational Cost
  // Base fixed cost per DC ($5000), marginal cost per TB ($12 in US, $18 in EU)
  const totalCost = openEU.mul(5000)
    .add(openUS.mul(5000))
    .add(capEU.mul(18))
    .add(capUS.mul(12));

  mip.minimize(totalCost);

  const status = await mip.solve();

  console.log(`HiGHS MIP Status: ${status}`);
  console.log(`Optimal Total Cost: $${mip.objectiveValue?.toLocaleString()}`);
  console.log(`US Center: ${openUS.value ? "ONLINE" : "OFFLINE"} (Allocation: ${capUS.value} TB/s)`);
  console.log(`EU Center: ${openEU.value ? "ONLINE" : "OFFLINE"} (Allocation: ${capEU.value} TB/s)`);
  console.log("\nPipeline finished successfully!");
}

run().catch(console.error);
