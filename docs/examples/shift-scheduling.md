# Staff Shift Scheduling & Conflict Diagnosis (MIP + Z3)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Binary MIP & SMT Unsat Core | HiGHS + Z3 | `m.binary(staff, days)`, `m.constraint()`, `expr`, `minimize`, `dot`, `m.check()` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=shift_scheduling">Playground (Roster)</a></li><li><a href="https://ohtaman.github.io/washi/demo/?preset=shift_conflict_unsat">Playground (Conflict)</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts">Source Code</a></li></ul> |

Staff shift scheduling is a classic real-world application of Mixed-Integer Programming in SaaS and workforce management tools. However, in real applications, **staff vacation requests frequently collide with minimum coverage or leadership rules**, causing the solver to return `Infeasible`.

This example demonstrates a practical production workflow:
1. **Try HiGHS MIP Optimization First:** Solve the shift model under the given vacation requests and operational constraints.
2. **Accept Solution if Optimal:** If a feasible roster is found, display the schedule and minimized payroll cost without unnecessary diagnostic overhead.
3. **Diagnose with Z3 `unsatCore` Only When Infeasible:** If HiGHS reports `Infeasible`, diagnose the **exact same model and constraints** with Z3 to isolate the conflicting constraint subset (`unsatCore`), pinpointing which day's coverage rules and which staff requests collided.

> [!IMPORTANT]
> **Vacation Requests are Hard Constraints:**
> In this model, vacation requests are enforced as strict hard constraints (`shift[staff][day] == 0`), not soft constraints with penalty relaxation. When requests collide with mandatory staffing requirements, the model is strictly infeasible.

<ShiftSchedulingDemo />

## Scenario & Rules

We schedule **5 staff members** (`Alice`, `Bob`, `Charlie`, `Diana`, `Evan`) across **7 days** (`Mon`–`Sun`):

- **Daily Headcount:** `Mon–Thu`: 3 staff, `Fri`: 4 staff, `Sat`: 3 staff, `Sun`: 2 staff.
- **Senior Duty:** At least 1 senior staff member (`Alice` or `Bob`) must be on duty every day.
- **Work Limit:** Each staff member works at most **5 days** per week.
- **Weekend Premium:** Weekend shifts (`Sat`, `Sun`) incur an extra `+$30` shift premium on top of base daily wage.

We evaluate two distinct, named scenarios with different vacation inputs to illustrate the full workflow:
- **Scenario A (Balanced Requests — Feasible):** Alice (Sun), Bob (Mon), Charlie (Sat), Diana (Wed). All constraints can be satisfied simultaneously. HiGHS outputs an optimal roster.
- **Scenario B (Conflicting Requests — Infeasible & Diagnosis):** Alice (Sat), Bob (Sat), Charlie (Sat), Diana (Wed). Because both senior leaders (Alice and Bob) request Saturday off simultaneously, the rule requiring at least 1 senior on duty every day cannot be satisfied. HiGHS reports `Infeasible`, triggering Z3 conflict diagnosis.

## Implementation in WaSHI

<CodeRunner preset="shift_scheduling">

```typescript
import { Model, sum, dot, minimize, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type Day = (typeof days)[number];

const staffList = [
  { name: "Alice",   isSenior: true,  dailyWage: 220, maxShifts: 5 },
  { name: "Bob",     isSenior: true,  dailyWage: 210, maxShifts: 5 },
  { name: "Charlie", isSenior: false, dailyWage: 160, maxShifts: 5 },
  { name: "Diana",   isSenior: false, dailyWage: 160, maxShifts: 5 },
  { name: "Evan",    isSenior: false, dailyWage: 150, maxShifts: 5 },
];

const requiredCoverage: Record<Day, number> = {
  Mon: 3, Tue: 3, Wed: 3, Thu: 3, Fri: 4, Sat: 3, Sun: 2,
};

function buildShiftModel(name: string, dayOffRequests: Array<{ staff: string; day: Day }>) {
  const m = new Model(name);

  // 2D binary matrix: shift[staff][day] ∈ {0, 1}
  const shift = m.binary(staffList.map((s) => s.name), [...days]);

  // Objective: Minimize weekly payroll cost via 2D dot product
  const costMatrix = Object.fromEntries(
    staffList.map((s) => [
      s.name,
      Object.fromEntries(
        days.map((d) => [d, s.dailyWage + (d === "Sat" || d === "Sun" ? 30 : 0)])
      ),
    ])
  );
  m.objective(minimize(dot(costMatrix, shift)));

  // Rule 1: Daily headcount coverage
  for (const d of days) {
    m.constraint(
      expr`${sum(staffList, (s) => shift[s.name][d])} >= ${requiredCoverage[d]}`,
      `coverage_${d}`
    );
  }

  // Rule 2: At least 1 senior staff member per day
  const seniors = staffList.filter((s) => s.isSenior);
  for (const d of days) {
    m.constraint(
      expr`${sum(seniors, (s) => shift[s.name][d])} >= 1`,
      `senior_duty_${d}`
    );
  }

  // Rule 3: Max working days per staff member
  for (const s of staffList) {
    m.constraint(
      expr`${sum(days, (d) => shift[s.name][d])} <= ${s.maxShifts}`,
      `max_shifts_${s.name}`
    );
  }

  // Rule 4: Named day-off requests as HARD constraints (shift[staff][day] == 0)
  for (const req of dayOffRequests) {
    m.constraint(
      expr`${shift[req.staff][req.day]} == 0`,
      `day_off_${req.staff}_${req.day}`
    );
  }

  return { model: m, shift };
}

async function runScenario(
  title: string,
  modelName: string,
  dayOffRequests: Array<{ staff: string; day: Day }>
) {
  console.log(`=== ${title} ===`);
  console.log(
    "Hard Vacation Requests: " +
      dayOffRequests.map((r) => `${r.staff} (${r.day})`).join(", ")
  );

  const { model, shift } = buildShiftModel(modelName, dayOffRequests);

  // Step 1: Optimize with HiGHS
  const status = await model.solve();
  console.log(`HiGHS Optimize Status: ${status}`);

  if (status === "Optimal") {
    console.log(`Optimal Weekly Payroll: $${model.objectiveValue}`);
    for (const s of staffList) {
      const schedule = days.map((d) => (Math.round(shift[s.name][d].value ?? 0) === 1 ? "ON" : " ·"));
      console.log(`  ${s.name.padEnd(8)}: ${schedule.join(" ")}`);
    }
    console.log("Schedule resolved successfully (no UNSAT diagnosis needed).\n");
  } else if (status === "Infeasible") {
    // Step 2: Diagnose the exact same model and constraints with Z3
    console.log("HiGHS returned Infeasible! Diagnosing conflict with Z3 unsatCore...");
    const checkRes = await model.check({ solver: "z3" });
    console.log(`Z3 Check Status: ${checkRes.status}`);
    console.log("Conflicting Constraint Subset (unsatCore):", model.unsatCore);
    console.log(
      "Note: unsatCore returns a conflicting subset (minimality/order not guaranteed). " +
      "Independent requests like Diana's Wednesday off are excluded.\n"
    );
  }
}

async function main() {
  // Scenario A: Balanced requests (Solvable)
  await runScenario(
    "Scenario A: Balanced Vacation Requests",
    "FeasibleRoster",
    [
      { staff: "Alice", day: "Sun" },
      { staff: "Bob", day: "Mon" },
      { staff: "Charlie", day: "Sat" },
      { staff: "Diana", day: "Wed" },
    ]
  );

  // Scenario B: Conflicting Saturday requests (Infeasible)
  await runScenario(
    "Scenario B: Conflicting Saturday Requests",
    "ConflictRoster",
    [
      { staff: "Alice", day: "Sat" }, // Senior
      { staff: "Bob", day: "Sat" },   // Senior
      { staff: "Charlie", day: "Sat" },
      { staff: "Diana", day: "Wed" },
    ]
  );
}

main();
```

</CodeRunner>
