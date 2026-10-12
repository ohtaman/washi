/**
 * Example 11: Staff Shift Scheduling & Vacation Conflict Diagnosis
 *
 * Demonstrates a practical real-world workflow with two distinct scenarios:
 *
 * - Scenario A (Feasible Roster Optimization with HiGHS):
 *   Balanced vacation requests can be fully satisfied. HiGHS finds an optimal
 *   cost-minimal weekly roster meeting coverage, senior leadership, and shift limits.
 *   No UNSAT diagnosis is needed.
 *
 * - Scenario B (Infeasible Vacation Clash & Diagnosis with Z3 unsatCore):
 *   Multiple staff members (including all senior leaders) request Saturday off,
 *   making Saturday coverage impossible. HiGHS reports Infeasible.
 *   The exact same model and constraints are then diagnosed with Z3 check(),
 *   extracting a conflicting constraint subset (unsatCore) to pinpoint the clash.
 *
 * Note on Vacation Requests:
 *   All vacation requests are modeled as hard constraints (shift[staff][day] == 0),
 *   meaning they must strictly be satisfied (not soft constraints with penalties).
 *
 * Solvers: HiGHS (MIP optimization) and Z3 (unsat core conflict diagnosis)
 * Run with: npx tsx examples/node/11-shift-scheduling.ts
 */

import { Model, sum, dot, expr } from "../../src/index.js";
import { registerZ3Solver } from "../../src/modeler/solvers/z3.js";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type Day = (typeof days)[number];

interface StaffMember {
  name: string;
  isSenior: boolean;
  dailyWage: number;
  maxShifts: number;
}

const staffList: StaffMember[] = [
  { name: "Alice",   isSenior: true,  dailyWage: 220, maxShifts: 5 },
  { name: "Bob",     isSenior: true,  dailyWage: 210, maxShifts: 5 },
  { name: "Charlie", isSenior: false, dailyWage: 160, maxShifts: 5 },
  { name: "Diana",   isSenior: false, dailyWage: 160, maxShifts: 5 },
  { name: "Evan",    isSenior: false, dailyWage: 150, maxShifts: 5 },
];

const requiredCoverage: Record<Day, number> = {
  Mon: 3,
  Tue: 3,
  Wed: 3,
  Thu: 3,
  Fri: 4,
  Sat: 3,
  Sun: 2,
};

function buildShiftModel(
  modelName: string,
  dayOffRequests: Array<{ staff: string; day: Day }>
) {
  const m = new Model(modelName);

  // 2D binary variables: shift[staff][day] = 1 if working, 0 if off
  const shift = m.binary(staffList.map((s) => s.name), [...days]);

  // Objective: Minimize total wage cost (with +$30 weekend shift premium) via 2D dot product
  const costMatrix = Object.fromEntries(
    staffList.map((s) => [
      s.name,
      Object.fromEntries(
        days.map((d) => [d, s.dailyWage + (d === "Sat" || d === "Sun" ? 30 : 0)])
      ),
    ])
  );
  m.minimize(dot(costMatrix, shift));

  // Rule 1: Daily minimum headcount coverage
  for (const d of days) {
    m.constrain(
      expr`${sum(staffList, (s) => shift[s.name][d])} >= ${requiredCoverage[d]}`,
      `coverage_${d}`
    );
  }

  // Rule 2: At least 1 senior staff member on duty every day
  const seniors = staffList.filter((s) => s.isSenior);
  for (const d of days) {
    m.constrain(
      expr`${sum(seniors, (s) => shift[s.name][d])} >= 1`,
      `senior_duty_${d}`
    );
  }

  // Rule 3: Maximum working days per week for each staff member (<= 5 days)
  for (const s of staffList) {
    m.constrain(
      expr`${sum(days, (d) => shift[s.name][d])} <= ${s.maxShifts}`,
      `max_shifts_${s.name}`
    );
  }

  // Rule 4: Hard vacation requests (strictly shift[staff][day] == 0, not soft penalty)
  for (const req of dayOffRequests) {
    m.constrain(
      expr`${shift[req.staff][req.day]} == 0`,
      `day_off_${req.staff}_${req.day}`
    );
  }

  return { model: m, shift };
}

/**
 * Production Workflow:
 * 1. Displays input conditions (requested days off as hard constraints).
 * 2. Runs MIP optimization with HiGHS.
 * 3. If Optimal: displays the roster table and optimal payroll cost.
 * 4. If Infeasible: diagnoses the exact same model and constraints with Z3 unsatCore.
 */
async function runShiftSchedulingWorkflow(
  scenarioTitle: string,
  modelName: string,
  dayOffRequests: Array<{ staff: string; day: Day }>
) {
  console.log(`=== ${scenarioTitle} ===`);
  console.log(
    "Input Hard Constraints (Requested Days Off): " +
      dayOffRequests.map((r) => `${r.staff} (${r.day})`).join(", ")
  );
  console.log("  (Note: Vacation requests are modeled as hard constraints, not soft penalties)\n");

  const t0 = performance.now();
  const { model, shift } = buildShiftModel(modelName, dayOffRequests);
  const buildMs = performance.now() - t0;

  // Step 1: Optimize with HiGHS
  console.log("Step 1: Solving optimization model with HiGHS...");
  const status = await model.optimize();
  console.log(
    `Result: Status=${status} (build: ${buildMs.toFixed(2)}ms, solve: ${(model.runTime * 1000).toFixed(2)}ms)`
  );

  if (status === "Optimal") {
    // Feasible: print roster and cost (no UNSAT diagnosis needed)
    console.log(`Optimal Weekly Payroll Cost: $${model.objectiveValue}\n`);
    const header = "Staff (Role)   | " + days.map((d) => d.padStart(4)).join(" ") + " | Total";
    console.log(header);
    console.log("-".repeat(header.length));
    for (const s of staffList) {
      let worked = 0;
      const cells = days.map((d) => {
        const on = Math.round(shift[s.name][d].value ?? 0) === 1;
        if (on) worked++;
        return on ? "  ON" : "   ·";
      });
      const role = s.isSenior ? "Sr" : "Jr";
      console.log(`${`${s.name} (${role})`.padEnd(15)}| ${cells.join(" ")} |   ${worked}/${s.maxShifts}`);
    }
    console.log("\nSchedule successfully generated. No conflict diagnosis required.\n");
  } else if (status === "Infeasible") {
    // Infeasible: diagnose the exact same problem with Z3 unsatCore
    console.log("\nStep 2: HiGHS reported Infeasible! Diagnosing root cause with Z3 unsatCore...");
    console.log("  (Diagnosing the exact same model and constraints without changing inputs)\n");

    const checkRes = await model.check({ solver: "z3" });
    console.log(`Z3 Feasibility Check Status: ${checkRes.status}`);

    if (checkRes.status === "Unsat") {
      console.log("⚠️ Conflicting Constraint Subset (unsatCore):");
      for (const cName of model.unsatCore) {
        console.log(`  ❌ ${cName}`);
      }
      console.log(
        "\nExplanation of Conflict:\n" +
          "  The core identifies that 'senior_duty_Sat' (requiring >= 1 senior on duty on Saturday)\n" +
          "  directly conflicts with 'day_off_Alice_Sat' and 'day_off_Bob_Sat' (both available seniors off).\n" +
          "  (Note: unsatCore returns a conflicting constraint subset; minimality and order are not guaranteed,\n" +
          "   while independent requests like Diana's Wednesday request are excluded from the core)\n"
      );
    }
  } else {
    console.log(`Solver ended with unexpected status: ${status}\n`);
  }
}

async function main() {
  registerZ3Solver();
  console.log("================================================================================");
  console.log("Staff Shift Scheduling: Optimization & Conflict Diagnosis Workflow");
  console.log("================================================================================\n");

  // Scenario A: Feasible Roster Optimization
  await runShiftSchedulingWorkflow(
    "Scenario A: Balanced Vacation Requests (Feasible Optimization)",
    "WeeklyRoster_Feasible",
    [
      { staff: "Alice",   day: "Sun" },
      { staff: "Bob",     day: "Mon" },
      { staff: "Charlie", day: "Sat" },
      { staff: "Diana",   day: "Wed" },
    ]
  );

  // Scenario B: Conflicting Saturday Vacation Requests
  await runShiftSchedulingWorkflow(
    "Scenario B: Conflicting Vacation Requests (Infeasible & Z3 Diagnosis)",
    "WeeklyRoster_Conflict",
    [
      { staff: "Alice",   day: "Sat" }, // Senior
      { staff: "Bob",     day: "Sat" }, // Senior
      { staff: "Charlie", day: "Sat" }, // Junior
      { staff: "Diana",   day: "Wed" }, // Unrelated weekday request
    ]
  );
}

main().catch(console.error);
