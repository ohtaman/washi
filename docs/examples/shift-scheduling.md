# Staff Shift Scheduling & Conflict Diagnosis (MIP + Z3)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Binary MIP & SMT Unsat Core | HiGHS + Z3 | `m.binary(staff, days)`, `m.constraint()`, `expr` (`sum`, `dot`), `minimize`, `m.check()`, `m.unsatCore` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=shift_scheduling">Playground (Roster)</a></li><li><a href="https://washi.ohtaman.dev/demo/?preset=shift_conflict_unsat">Playground (Conflict)</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts">Source Code</a></li></ul> |

In staff shift scheduling, vacation requests often collide with minimum headcount or senior coverage rules, causing a Mixed-Integer Programming (MIP) solver to return `"Infeasible"`.

This example shows a two-step workflow on the same model:
1. **Optimize with HiGHS first:** Minimize weekly payroll cost under all vacation requests and staffing rules.
2. **Use the roster if `"Optimal"`:** Output the schedule and payroll cost with no extra diagnostic step.
3. **Diagnose with Z3 if `"Infeasible"`:** Call `model.check({ solver: "z3" })` on the same model to extract the conflicting rule subset (`unsatCore`).

> [!IMPORTANT]
> **Vacation Requests Are Hard Constraints:**
> Each vacation request is modeled as a strict rule (`shift[staff][day] == 0`), not a penalized preference. When requests clash with mandatory coverage, the model is strictly `"Infeasible"`.

<ShiftSchedulingDemo />

## Scenario & Rules

We schedule **5 staff members** across **7 days** from `Mon` to `Sun` — seniors `Alice` (`$220/day`) and `Bob` (`$210/day`), plus `Charlie` (`$160/day`), `Diana` (`$160/day`), and `Evan` (`$150/day`):

- **Daily Headcount:** `Mon–Thu`: 3 staff, `Fri`: 4 staff, `Sat`: 3 staff, `Sun`: 2 staff.
- **Senior Duty:** At least 1 senior staff member (`Alice` or `Bob`) must work every day.
- **Work Limit:** Each staff member works at most **5 days** per week.
- **Weekend Premium:** `Sat` and `Sun` shifts add `+$30` to the base daily wage.

We run two scenarios to show both outcomes:

| Scenario | Hard Day-Off Requests | Outcome |
| :--- | :--- | :--- |
| **Scenario A (Feasible)** | `Alice (Sun)`, `Bob (Mon)`, `Charlie (Sat)`, `Diana (Wed)` | HiGHS returns `"Optimal"` (`$3,830` weekly payroll). |
| **Scenario B (Conflict)** | `Alice (Sat)`, `Bob (Sat)`, `Charlie (Sat)`, `Diana (Wed)` | Both seniors request Saturday off, so HiGHS returns `"Infeasible"` and Z3 extracts `unsatCore`. |

## Implementation in WaSHI

> [!NOTE]
> **Z3 Prerequisites:** Importing `@ohtaman/washi/solvers/z3` requires the optional `z3-solver` peer dependency (`npm install z3-solver`). Running Z3 in a browser also requires Cross-Origin Isolation (`COOP` / `COEP`) headers — see [Cross-Origin Isolation](../getting-started/cross-origin.md).

<CodeRunner preset="shift_scheduling">

```typescript
import { Model, minimize, expr } from "@ohtaman/washi";
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
  m.objective(minimize(expr`dot(${costMatrix}, ${shift})`));

  // Rule 1: Daily headcount coverage
  for (const d of days) {
    m.constraint(
      expr`sum(${staffList}, ${(s) => shift[s.name][d]}) >= ${requiredCoverage[d]}`,
      `coverage_${d}`
    );
  }

  // Rule 2: At least 1 senior staff member per day
  const seniors = staffList.filter((s) => s.isSenior);
  for (const d of days) {
    m.constraint(
      expr`sum(${seniors}, ${(s) => shift[s.name][d]}) >= 1`,
      `senior_duty_${d}`
    );
  }

  // Rule 3: Max working days per staff member
  for (const s of staffList) {
    m.constraint(
      expr`sum(${shift[s.name]}) <= ${s.maxShifts}`,
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
      const schedule = days.map((d) => (shift[s.name][d].value === 1 ? "ON" : " ·"));
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
      "In this run, unrelated requests like Diana's Wednesday off are excluded.\n"
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

## Relaxing Conflicts with Soft Constraints

After Z3 isolates the conflict among `senior_duty_Sat`, `day_off_Alice_Sat`, and `day_off_Bob_Sat`, you can generate a fallback schedule by relaxing the hard day-off constraints (Rule 4) into **soft preferences** that add a `$500` penalty per overridden request:

```typescript
// Soft constraint pattern: penalize working on a requested day off by $500
// instead of enforcing hard shift[req.staff][req.day] == 0
const requestedShiftVars = dayOffRequests.map((req) => shift[req.staff][req.day]);
m.objective(minimize(expr`dot(${costMatrix}, ${shift}) + 500 * sum(${requestedShiftVars})`));
```

On Scenario B, HiGHS returns `"Optimal"` with an objective value of **`$4,330`** (`$3,830` payroll plus one `$500` penalty). It honors 3 of the 4 requests and overrides only 1 senior request (`Alice (Sat)` in the HiGHS output). Because `Bob` (`$210/day`) is cheaper than `Alice` (`$220/day`), the cheapest staffing assigns `Bob` up to his limit (`maxShifts = 5`) and `Alice` to the remaining 2 senior days; overriding `Alice (Sat)` or `Bob (Sat)` therefore yields the exact same total cost of `$4,330`.

> [!TIP]
> This model uses only binary variables (`m.binary()`) and constraints with integer coefficients. You can also extract `unsatCore` via `await model.check({ solver: "pumpkin" })` using the bundled `@ohtaman/washi/solvers/pumpkin` engine without installing `z3-solver`.
