import { Model, expr } from "../../src/index.js";
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
interface RunPipelineOptions {
  scenarioName: string;
  forceConflict?: boolean;
}

/**
 * Executes the hybrid pipeline for a given policy scenario:
 * 1. Step 1 (Z3 SMT): Propositional feasibility check.
 *    If the result is anything other than "Sat" (such as "Unsat" or "Unknown"),
 *    halt the pipeline early to prevent running costly optimization on contradictory logic.
 * 2. Step 2 (HiGHS MIP): Solve resource allocation only after the policy is verified SAT.
 */
async function runHybridPipeline({ scenarioName, forceConflict = false }: RunPipelineOptions) {
  console.log(`\n--- Scenario: ${scenarioName} ---`);

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
  policyModel.constrain(deployEurope.implies(complianceGDPR), "r1_gdpr");

  // Rule 2: Multi-region deployment requires high budget tier: (deployEurope & deployUS) -> budgetTierHigh
  policyModel.constrain(deployEurope.and(deployUS).implies(budgetTierHigh), "r2_budget");

  // Desired deployment configuration: Deploy both Europe and US, with GDPR compliance enabled
  policyModel.constrain(deployEurope)
    .constrain(deployUS)
    .constrain(complianceGDPR);

  if (forceConflict) {
    // Contradictory policy: High budget tier is NOT approved (low budget forced),
    // which contradicts Rule 2 ((deployEurope & deployUS) -> budgetTierHigh).
    policyModel.constrain(budgetTierHigh.not(), "r3_low_budget_cap");
  } else {
    // Consistent policy: High budget tier is approved
    policyModel.constrain(budgetTierHigh, "r3_high_budget_approved");
  }

  const policyCheck = await policyModel.check();
  const isSatisfiable = policyCheck.status === "Sat";
  console.log(`SMT Check Result: ${isSatisfiable ? "SAT (Feasible & Consistent)" : `UNSAT (status: ${policyCheck.status})`}`);

  // Guard: Only proceed to the optimization stage if SAT is confirmed.
  // Unsat or Unknown must halt the pipeline before invoking numerical solvers.
  if (!isSatisfiable) {
    console.log("Policy rules are inconsistent! Halting optimization pipeline before solver invocation.");
    return { status: policyCheck.status, executedMIP: false };
  }

  // -------------------------------------------------------------
  // Step 2: High-Performance Numerical Optimization with HiGHS MIP
  // -------------------------------------------------------------
  console.log("\nStep 2: Policy verified. Solving resource allocation & fixed-charge MIP with HiGHS...");
  const mip = new Model("DataCenterCapacityAllocation");

  // Continuous traffic capacity in TB/s
  const capEU = mip.continuous("capEU", { lb: 0, ub: 500 });
  const capUS = mip.continuous("capUS", { lb: 0, ub: 500 });

  // Binary activation decisions
  const openEU = mip.binary("openEU");
  const openUS = mip.binary("openUS");

  // Big-M Indicator Constraints:
  // If openEU == 0 -> capEU <= 0 (cannot route traffic if cluster is offline)
  // If openUS == 0 -> capUS <= 0
  mip.addIndicator(openEU, capEU.le(0), { activeValue: 0, M: 500, name: "eu_offline" });
  mip.addIndicator(openUS, capUS.le(0), { activeValue: 0, M: 500, name: "us_offline" });

  // Minimum activation batch (at least 50 TB/s if activated)
  mip.addIndicator(openEU, capEU.ge(50), { activeValue: 1, M: 500, name: "eu_min_batch" });
  mip.addIndicator(openUS, capUS.ge(50), { activeValue: 1, M: 500, name: "us_min_batch" });

  // Demand requirement: total traffic >= 450 TB/s
  mip.constrain(expr`${capEU} + ${capUS} >= 450`, "total_demand");

  // Objective: Minimize Operational Cost
  // Base fixed cost per DC ($5000), marginal cost per TB ($12 in US, $18 in EU)
  mip.minimize(expr`5000 * ${openEU} + 5000 * ${openUS} + 18 * ${capEU} + 12 * ${capUS}`);

  const status = await mip.optimize();

  console.log(`HiGHS MIP Status: ${status}`);
  console.log(`Optimal Total Cost: $${mip.objectiveValue?.toLocaleString()}`);
  console.log(`US Center: ${openUS.value ? "ONLINE" : "OFFLINE"} (Allocation: ${capUS.value} TB/s)`);
  console.log(`EU Center: ${openEU.value ? "ONLINE" : "OFFLINE"} (Allocation: ${capEU.value} TB/s)`);
  console.log("Pipeline finished successfully!");

  return { status, executedMIP: true, objectiveValue: mip.objectiveValue };
}

async function run() {
  console.log("=== Hybrid Optimization: SMT Verification -> HiGHS MIP Solving ===");

  // Scenario 1: Contradictory policy rules (demonstrates early halt on UNSAT)
  await runHybridPipeline({
    scenarioName: "1. Contradictory Policy (Multi-region requested without High Budget)",
    forceConflict: true,
  });

  // Scenario 2: Feasible policy rules (demonstrates SAT check -> HiGHS MIP optimization)
  await runHybridPipeline({
    scenarioName: "2. Feasible Policy (High Budget approved -> proceed to HiGHS MIP)",
    forceConflict: false,
  });
}

run().catch(console.error);
