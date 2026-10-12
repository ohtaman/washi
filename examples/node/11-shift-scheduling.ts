/**
 * Example 11: Staff Shift Scheduling & Vacation Conflict Diagnosis
 *
 * Demonstrates a practical two-scenario workflow:
 * - Scenario 1 (Feasible Optimization with HiGHS):
 *   Assign 5 staff members across a 7-day week meeting daily coverage, senior leader
 *   requirements, max 5 working days per person, and requested days off while minimizing
 *   total wage & weekend penalty cost.
 * - Scenario 2 (Infeasible Vacation Clash Diagnosed with Z3 `unsatCore`):
 *   When 3 staff members simultaneously request Saturday off while Saturday requires
 *   at least 3 working staff, the schedule becomes infeasible. Z3 extracts a conflicting
 *   constraint subset (`unsatCore`) pinpointing the exact clash.
 *
 * Solvers: HiGHS (MIP optimization) and Z3 (unsat core conflict diagnosis)
 * Run with: npx tsx examples/node/11-shift-scheduling.ts
 */

import { Model, sum } from "../../src/index.js";
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
  const m = new Model({ name: modelName, sense: "Minimize" });

  // 2D binary variables: shift[staff][day] = 1 if working, 0 if off
  const shift = m.addVars(
    staffList.map((s) => s.name),
    [...days],
    { type: "Binary", prefix: "shift" }
  );

  // Objective: Minimize total wage cost (with +$30 weekend shift premium)
  const costTerms = [];
  for (const s of staffList) {
    for (const d of days) {
      const isWeekend = d === "Sat" || d === "Sun";
      const cost = s.dailyWage + (isWeekend ? 30 : 0);
      costTerms.push(shift[s.name][d].mul(cost));
    }
  }
  m.minimize(sum(costTerms));

  // Rule 1: Daily minimum headcount coverage
  for (const d of days) {
    m.addConstraint(
      sum(staffList, (s) => shift[s.name][d]).ge(requiredCoverage[d]),
      `coverage_${d}`
    );
  }

  // Rule 2: At least 1 senior staff member on duty every day
  const seniors = staffList.filter((s) => s.isSenior);
  for (const d of days) {
    m.addConstraint(
      sum(seniors, (s) => shift[s.name][d]).ge(1),
      `senior_duty_${d}`
    );
  }

  // Rule 3: Maximum working days per week for each staff member
  for (const s of staffList) {
    m.addConstraint(
      sum([...days], (d) => shift[s.name][d]).le(s.maxShifts),
      `max_shifts_${s.name}`
    );
  }

  // Rule 4: Honored day-off requests (shift[staff][day] == 0)
  for (const req of dayOffRequests) {
    m.addConstraint(
      shift[req.staff][req.day].le(0),
      `day_off_${req.staff}_${req.day}`
    );
  }

  return { model: m, shift };
}

async function main() {
  registerZ3Solver();
  console.log("=== Staff Shift Scheduling & Conflict Diagnosis ===\n");

  // ---------------------------------------------------------------------------
  // Part 1: Feasible Roster Optimization (HiGHS MIP)
  // ---------------------------------------------------------------------------
  console.log("Part 1: Optimizing Weekly Roster with Balanced Day-Off Requests (HiGHS)...");
  const t0 = performance.now();
  const { model: feasibleModel, shift } = buildShiftModel("WeeklyRoster_Feasible", [
    { staff: "Alice",   day: "Sun" },
    { staff: "Bob",     day: "Mon" },
    { staff: "Charlie", day: "Sat" },
    { staff: "Diana",   day: "Wed" },
  ]);
  const buildMs = performance.now() - t0;

  const status = await feasibleModel.solve();
  console.log(`Status: ${status} (build: ${buildMs.toFixed(2)}ms, solve: ${(feasibleModel.runTime * 1000).toFixed(2)}ms)`);
  console.log(`Optimal Weekly Payroll Cost: $${feasibleModel.objectiveValue}\n`);

  const header = "Staff (Role)   | " + days.map((d) => d.padStart(4)).join(" ") + " | Total";
  console.log(header);
  console.log("-".repeat(header.length));
  for (const s of staffList) {
    let worked = 0;
    const cells = days.map((d) => {
      const on = Math.round(shift[s.name][d].value ?? 0) === 1;
      if (on) worked++;
      return (on ? "  ON" : "   ·");
    });
    const role = s.isSenior ? "Sr" : "Jr";
    console.log(`${`${s.name} (${role})`.padEnd(15)}| ${cells.join(" ")} |   ${worked}/${s.maxShifts}`);
  }

  // ---------------------------------------------------------------------------
  // Part 2: Conflicting Saturday Vacation Requests (Z3 Unsat Core Diagnosis)
  // ---------------------------------------------------------------------------
  console.log("\nPart 2: Diagnosing Infeasible Saturday Vacation Requests (Z3 Unsat Core)...");
  // Saturday requires 3 staff (`coverage_Sat >= 3`), and both seniors (Alice & Bob)
  // plus Charlie & Diana request Saturday off -> impossible to meet coverage_Sat or senior_duty_Sat!
  const { model: conflictModel } = buildShiftModel("WeeklyRoster_Conflict", [
    { staff: "Alice",   day: "Sat" },
    { staff: "Bob",     day: "Sat" },
    { staff: "Charlie", day: "Sat" },
    { staff: "Diana",   day: "Wed" }, // unrelated weekday request
  ]);

  const checkRes = await conflictModel.check({ solver: "z3" });
  console.log(`Feasibility Check Status: ${checkRes.status}`);
  if (checkRes.status === "Unsat") {
    console.log("⚠️ Conflicting Constraint Subset (unsatCore):");
    for (const cName of conflictModel.unsatCore) {
      console.log(`  ❌ ${cName}`);
    }
    console.log("  (Note: unrelated constraints like 'day_off_Diana_Wed' are excluded from the core)");
  }
}

main().catch(console.error);
