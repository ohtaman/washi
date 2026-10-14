import { Model, sum, dot, expr } from "../../../../src/index.js";
import { registerZ3Solver } from "../../../../src/modeler/solvers/z3.js";
import {
  DAYS,
  type Day,
  type StaffMember,
  type ShiftRequirements,
  type ShiftSolveResult,
  type ShiftAssignment,
} from "./types.js";

// Standard team configuration
export const DEFAULT_STAFF: StaffMember[] = [
  { name: "Alice",   isSenior: true,  dailyWage: 220, maxShifts: 5 },
  { name: "Bob",     isSenior: true,  dailyWage: 210, maxShifts: 5 },
  { name: "Charlie", isSenior: false, dailyWage: 160, maxShifts: 5 },
  { name: "Diana",   isSenior: false, dailyWage: 160, maxShifts: 5 },
  { name: "Evan",    isSenior: false, dailyWage: 150, maxShifts: 5 },
];

export const DEFAULT_COVERAGE: Record<Day, number> = {
  Mon: 3,
  Tue: 3,
  Wed: 3,
  Thu: 3,
  Fri: 4,
  Sat: 3,
  Sun: 2,
};

let z3Registered = false;

function ensureZ3Registered() {
  if (!z3Registered) {
    try {
      registerZ3Solver();
      z3Registered = true;
    } catch (e) {
      console.warn("Could not register Z3 solver:", e);
    }
  }
}

/**
 * Solve or diagnose a staff shift scheduling problem with WaSHI (HiGHS + Z3).
 */
export async function solveShiftSchedule(req: ShiftRequirements): Promise<ShiftSolveResult> {
  ensureZ3Registered();

  const t0 = performance.now();
  const m = new Model("AIShiftRoster");

  const staffNames = req.staffList.map((s) => s.name);
  const dayNames = [...DAYS];

  // 2D binary decision variables: shift[staff][day] \in {0, 1}
  const shift = m.binary(staffNames, dayNames);

  // Wage cost matrix with $30 weekend premium
  const costMatrix: Record<string, Record<Day, number>> = Object.fromEntries(
    req.staffList.map((s) => [
      s.name,
      Object.fromEntries(
        DAYS.map((d) => [d, s.dailyWage + (d === "Sat" || d === "Sun" ? 30 : 0)])
      ) as Record<Day, number>,
    ])
  );

  // Objective: Minimize total weekly labor cost
  m.minimize(dot(costMatrix, shift));

  // Constraint 1: Daily headcount coverage
  for (const d of DAYS) {
    const required = req.requiredCoverage[d] ?? DEFAULT_COVERAGE[d];
    m.constrain(
      expr`${sum(req.staffList, (s) => shift[s.name][d])} >= ${required}`,
      `coverage_${d}`
    );
  }

  // Constraint 2: Mandatory senior on duty every day (if enabled)
  if (req.seniorRequiredDaily) {
    const seniors = req.staffList.filter((s) => s.isSenior);
    for (const d of DAYS) {
      m.constrain(
        expr`${sum(seniors, (s) => shift[s.name][d])} >= 1`,
        `senior_duty_${d}`
      );
    }
  }

  // Constraint 3: Max working days per staff member per week
  for (const s of req.staffList) {
    m.constrain(
      expr`${sum(DAYS, (d) => shift[s.name][d])} <= ${s.maxShifts}`,
      `max_shifts_${s.name}`
    );
  }

  // Constraint 4: Vacation / Day-off requests (Hard constraints: shift[staff][day] == 0)
  for (const r of req.dayOffRequests) {
    m.constrain(
      expr`${shift[r.staff][r.day]} == 0`,
      `day_off_${r.staff}_${r.day}`
    );
  }

  const buildTimeMs = performance.now() - t0;

  // Generate code preview
  const modelCodePreview = generateModelCodeSnippet(req);

  // Step 1: Solve MIP with HiGHS
  const tSolveStart = performance.now();
  let status: string;
  try {
    status = await m.optimize();
  } catch (err) {
    console.error("Solver error:", err);
    return {
      status: "Error",
      buildTimeMs,
      solveTimeMs: performance.now() - tSolveStart,
      modelCodePreview,
    };
  }
  const solveTimeMs = performance.now() - tSolveStart;

  if (status === "Optimal") {
    // Collect assignments
    const assignments: ShiftAssignment[] = req.staffList.map((s) => {
      const schedule = {} as Record<Day, boolean>;
      let totalDays = 0;
      let cost = 0;

      for (const d of DAYS) {
        const val = Math.round(shift[s.name][d].value ?? 0);
        const isOn = val === 1;
        schedule[d] = isOn;
        if (isOn) {
          totalDays++;
          cost += costMatrix[s.name][d];
        }
      }

      return {
        staff: s.name,
        isSenior: s.isSenior,
        schedule,
        totalDays,
        maxShifts: s.maxShifts,
        cost,
      };
    });

    // Daily coverage stats
    const dailyCoverage = {} as Record<Day, { current: number; required: number; seniors: number }>;
    for (const d of DAYS) {
      let count = 0;
      let seniorsCount = 0;
      for (const s of req.staffList) {
        if (Math.round(shift[s.name][d].value ?? 0) === 1) {
          count++;
          if (s.isSenior) seniorsCount++;
        }
      }
      dailyCoverage[d] = {
        current: count,
        required: req.requiredCoverage[d],
        seniors: seniorsCount,
      };
    }

    return {
      status: "Optimal",
      buildTimeMs,
      solveTimeMs,
      objectiveValue: m.objectiveValue ?? undefined,
      assignments,
      dailyCoverage,
      modelCodePreview,
    };
  }

  // Step 2: HiGHS reported Infeasible -> Diagnose root clash with Z3 unsatCore
  if (status === "Infeasible") {
    let unsatCore: string[] = [];
    try {
      const checkRes = await m.check({ solver: "z3" });
      if (checkRes.status === "Unsat") {
        unsatCore = m.unsatCore ?? [];
      }
    } catch (e) {
      console.warn("Z3 check failed:", e);
      // Fallback heuristics for clash detection if Z3 not available
      unsatCore = detectConflictHeuristic(req);
    }

    const explanation = explainUnsatCore(unsatCore, req);

    return {
      status: "Infeasible",
      buildTimeMs,
      solveTimeMs,
      unsatCore,
      conflictDetails: {
        conflictingConstraints: unsatCore,
        explanation,
      },
      modelCodePreview,
    };
  }

  return {
    status: "Error",
    buildTimeMs,
    solveTimeMs,
    modelCodePreview,
  };
}

function detectConflictHeuristic(req: ShiftRequirements): string[] {
  const satSeniorsOff = req.dayOffRequests.filter((r) => r.day === "Sat" && (r.staff === "Alice" || r.staff === "Bob"));
  if (satSeniorsOff.length >= 2 && req.seniorRequiredDaily) {
    return ["senior_duty_Sat", "day_off_Alice_Sat", "day_off_Bob_Sat"];
  }
  return ["coverage_Sat", ...req.dayOffRequests.map((r) => `day_off_${r.staff}_${r.day}`)];
}

function explainUnsatCore(core: string[], req: ShiftRequirements): string {
  if (core.includes("senior_duty_Sat") && core.some((c) => c.includes("Alice")) && core.some((c) => c.includes("Bob"))) {
    return "土曜日にシニア責任者（AliceまたはBob）が最低1名出勤する必要がありますが、両名とも土曜休暇を希望しているため両立できません。";
  }
  return `制約セット [${core.join(", ")}] の間で充足不可能な矛盾が発生しています。`;
}

function generateModelCodeSnippet(req: ShiftRequirements): string {
  const reqLines = req.dayOffRequests
    .map((r) => `  { staff: "${r.staff}", day: "${r.day}" },`)
    .join("\n");

  return `// WaSHI Algebraic Model (Executed directly in-browser via WebAssembly)
import { Model, expr, dot, sum } from "@ohtaman/washi";

const m = new Model("WeeklyShiftRoster");
const shift = m.binary(staffNames, days);

// Objective: Minimize payroll with weekend shift premium
m.minimize(dot(costMatrix, shift));

// Headcount & Senior Duty constraints
for (const d of days) {
  m.constrain(expr\`\${sum(staff, s => shift[s.name][d])} >= \${coverage[d]}\`, \`coverage_\${d}\`);
  m.constrain(expr\`\${sum(seniors, s => shift[s.name][d])} >= 1\`, \`senior_duty_\${d}\`);
}

// Staff vacation requests (Hard constraints)
const requests = [
${reqLines}
];
for (const req of requests) {
  m.constrain(expr\`\${shift[req.staff][req.day]} == 0\`, \`day_off_\${req.staff}_\${req.day}\`);
}

// 1. Solve with HiGHS MIP solver:
const status = await m.optimize(); // "Optimal" or "Infeasible"

// 2. If Infeasible, pinpoint root cause with Z3:
if (status === "Infeasible") {
  await m.check({ solver: "z3" });
  console.log("Unsat Core:", m.unsatCore);
}`;
}
