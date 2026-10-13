import { fileURLToPath } from "node:url";
import { Model, expr, c, minimize } from "../../src/index.js";
import { Z3Solver } from "../../src/modeler/solvers/z3.js";

/**
 * 07-hybrid-smt-mip.ts
 *
 * Demonstrates the Hybrid SMT + MIP Architecture:
 * 1. Diagnostic Step (Z3 SMT): Verify satisfiability of discrete business rules
 *    and ensure no logical deadlocks exist before committing to optimization.
 * 2. Optimization Step (HiGHS MIP): Carry over verified deployment decisions
 *    and use Big-M auto-linearization (`indicator`) to find optimal capacity allocation.
 */
export interface RunPipelineOptions {
  scenarioName: string;
  forceConflict?: boolean;
  mockStatus?: "Sat" | "Unsat" | "Unknown";
}

export interface PipelineResult {
  status: "Sat" | "Unsat" | "Unknown" | string;
  executedMIP: boolean;
  openEU?: number | null;
  openUS?: number | null;
  capEU?: number | null;
  capUS?: number | null;
  objectiveValue?: number | null;
}

/**
 * Executes the hybrid pipeline for a given policy scenario:
 * 1. Step 1 (Z3 SMT): Propositional feasibility check.
 *    Only proceed when status is strictly "Sat".
 *    "Unsat" halts due to logical contradictions.
 *    "Unknown" halts safely because satisfiability cannot be guaranteed.
 * 2. Step 2 (HiGHS MIP): Transfer verified deployment decisions into MIP constraints
 *    and solve numerical capacity allocation.
 */
export async function runHybridPipeline({
  scenarioName,
  forceConflict = false,
  mockStatus,
}: RunPipelineOptions): Promise<PipelineResult> {
  console.log(`\n--- Scenario: ${scenarioName} ---`);

  // -------------------------------------------------------------
  // Step 1: Logical Satisfiability & Invariant Check using Z3 SMT
  // -------------------------------------------------------------
  console.log("Step 1: Checking propositional policy feasibility with Z3...");
  const policyModel = new Model({ name: "CloudDeploymentPolicy", solver: new Z3Solver() });

  const deployEurope = policyModel.bool("deployEurope");
  const deployUS = policyModel.bool("deployUS");
  const complianceGDPR = policyModel.bool("complianceGDPR");
  const budgetTierHigh = policyModel.bool("budgetTierHigh");

  // Rule 1: Europe requires GDPR compliance: deployEurope -> complianceGDPR
  policyModel.constraint(deployEurope.implies(complianceGDPR), "r1_gdpr");

  // Rule 2: Multi-region deployment requires high budget tier: (deployEurope & deployUS) -> budgetTierHigh
  policyModel.constraint(deployEurope.and(deployUS).implies(budgetTierHigh), "r2_budget");

  // Desired deployment configuration: Deploy both Europe and US, with GDPR compliance enabled
  policyModel.constraint(deployEurope)
    .constraint(deployUS)
    .constraint(complianceGDPR);

  if (forceConflict) {
    // Contradictory policy: High budget tier is NOT approved (low budget forced),
    // which contradicts Rule 2 ((deployEurope & deployUS) -> budgetTierHigh).
    policyModel.constraint(budgetTierHigh.not(), "r3_low_budget_cap");
  } else {
    // Consistent policy: High budget tier is approved
    policyModel.constraint(budgetTierHigh, "r3_high_budget_approved");
  }

  const policyCheck = mockStatus
    ? { status: mockStatus, values: {} }
    : await policyModel.check();

  // Guard: Only proceed to the optimization stage if SAT is confirmed.
  // Distinguish Unsat (contradiction) from Unknown (undetermined).
  if (policyCheck.status === "Sat") {
    console.log("SMT Check Result: SAT (Feasible & Consistent)");
  } else if (policyCheck.status === "Unsat") {
    console.log("SMT Check Result: UNSAT (Inconsistent policy rules detected)");
    console.log("Policy rules are inconsistent! Halting optimization pipeline before solver invocation.");
    return { status: "Unsat", executedMIP: false };
  } else {
    console.log(`SMT Check Result: UNKNOWN (Satisfiability undetermined: ${policyCheck.status})`);
    console.log(`Policy satisfiability could not be confirmed (status: ${policyCheck.status})! Halting optimization pipeline safely.`);
    return { status: policyCheck.status, executedMIP: false };
  }

  // -------------------------------------------------------------
  // Step 2: High-Performance Numerical Optimization with HiGHS MIP
  // -------------------------------------------------------------
  console.log("\nStep 2: Policy verified. Transferring deployment decisions to HiGHS MIP...");
  const mip = new Model("DataCenterCapacityAllocation");

  // Continuous traffic capacity in TB/s
  const capEU = mip.continuous("capEU", { lb: 0, ub: 500 });
  const capUS = mip.continuous("capUS", { lb: 0, ub: 500 });

  // Binary activation decisions
  const openEU = mip.binary("openEU");
  const openUS = mip.binary("openUS");

  // Carry over SMT-verified deployment decisions:
  // Since SMT verified that deployEurope and deployUS are feasible together,
  // enforce both data centers to be online to satisfy the business policy (Issue #34).
  if (deployEurope.value ?? true) {
    mip.constraint(openEU.eq(1), "enforce_eu_deployment");
  }
  if (deployUS.value ?? true) {
    mip.constraint(openUS.eq(1), "enforce_us_deployment");
  }

  // Big-M Indicator Constraints:
  // If openEU == 0 -> capEU <= 0 (cannot route traffic if cluster is offline)
  // If openUS == 0 -> capUS <= 0
  mip.indicator(openEU, capEU.le(0), { activeValue: 0, M: 500, name: "eu_offline" });
  mip.indicator(openUS, capUS.le(0), { activeValue: 0, M: 500, name: "us_offline" });

  // Minimum activation batch (at least 50 TB/s if activated)
  mip.indicator(openEU, capEU.ge(50), { activeValue: 1, M: 500, name: "eu_min_batch" });
  mip.indicator(openUS, capUS.ge(50), { activeValue: 1, M: 500, name: "us_min_batch" });

  // Demand requirement: total traffic >= 450 TB/s
  mip.constraint(c`${capEU} + ${capUS} >= 450`, "total_demand");

  // Objective: Minimize Operational Cost
  // Base fixed cost per DC ($5000), marginal cost per TB ($12 in US, $18 in EU)
  mip.objective(minimize(expr`5000 * ${openEU} + 5000 * ${openUS} + 18 * ${capEU} + 12 * ${capUS}`));

  const status = await mip.solve();

  console.log(`HiGHS MIP Status: ${status}`);
  console.log(`Optimal Total Cost: $${mip.objectiveValue?.toLocaleString()}`);
  console.log(`US Center: ${openUS.value ? "ONLINE" : "OFFLINE"} (Allocation: ${capUS.value} TB/s)`);
  console.log(`EU Center: ${openEU.value ? "ONLINE" : "OFFLINE"} (Allocation: ${capEU.value} TB/s)`);
  console.log("Pipeline finished successfully!");

  return {
    status: policyCheck.status,
    executedMIP: true,
    openEU: openEU.value,
    openUS: openUS.value,
    capEU: capEU.value,
    capUS: capUS.value,
    objectiveValue: mip.objectiveValue,
  };
}

export async function run() {
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

const isDirectRun = Boolean(
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
);

if (isDirectRun) {
  run().catch(console.error);
}
