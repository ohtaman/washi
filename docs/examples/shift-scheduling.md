# Staff Shift Scheduling & Conflict Diagnosis (MIP + Z3)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Binary MIP & SMT Unsat Core | HiGHS + Z3 | `m.addVars(staff, days)`, `sum()`, `m.check()`, `m.unsatCore` | [Playground (Roster)](https://ohtaman.github.io/washi/demo/?preset=shift_scheduling) · [Playground (Conflict)](https://ohtaman.github.io/washi/demo/?preset=shift_conflict_unsat) · [Source Code](https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts) |

Staff shift scheduling is a classic real-world application of Mixed-Integer Programming in SaaS and workforce management tools. However, in real applications, **staff vacation requests frequently collide with minimum daily coverage rules**, causing the solver to return `Infeasible`.

This example shows how to combine WaSHI's two strengths in one workflow:
1. **Optimize Feasible Schedules with HiGHS:** Generate a cost-minimal weekly roster respecting daily headcount, senior shift leadership, max working days, and vacation requests.
2. **Pinpoint Conflicting Requests with Z3 (`unsatCore`):** When overlapping vacation requests make the schedule infeasible, extract a conflicting constraint subset (`unsatCore`) so your UI can tell the manager *which day's coverage rule and whose day-off requests collided*.

<ShiftSchedulingDemo />

## Scenario & Rules

We schedule **5 staff members** (`Alice`, `Bob`, `Charlie`, `Diana`, `Evan`) across **7 days** (`Mon`–`Sun`):

- **Daily Headcount:** `Mon–Thu`: 3 staff, `Fri`: 4 staff, `Sat`: 3 staff, `Sun`: 2 staff.
- **Senior Duty:** At least 1 senior staff member (`Alice` or `Bob`) must be on duty every day.
- **Work Limit:** Each staff member works at most **5 days** per week.
- **Weekend Premium:** Weekend shifts (`Sat`, `Sun`) incur an extra `+$30` shift premium on top of base daily wage.

## Implementation in WaSHI

<CodeRunner preset="shift_scheduling">

```typescript
import { Model, sum } from "@ohtaman/washi";
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

function buildShiftModel(name, dayOffRequests) {
  const m = new Model({ name, sense: "Minimize" });

  // 2D binary matrix: shift[staff][day] ∈ {0, 1}
  const shift = m.addVars(
    staffList.map((s) => s.name),
    [...days],
    { type: "Binary", prefix: "shift" }
  );

  // Objective: Minimize weekly payroll cost (+$30 weekend premium)
  const costTerms = [];
  for (const s of staffList) {
    for (const d of days) {
      const cost = s.dailyWage + (d === "Sat" || d === "Sun" ? 30 : 0);
      costTerms.push(shift[s.name][d].mul(cost));
    }
  }
  m.minimize(sum(costTerms));

  // Rule 1: Daily headcount coverage
  for (const d of days) {
    m.addConstraint(sum(staffList, (s) => shift[s.name][d]).ge(requiredCoverage[d]), `coverage_${d}`);
  }

  // Rule 2: At least 1 senior staff member per day
  const seniors = staffList.filter((s) => s.isSenior);
  for (const d of days) {
    m.addConstraint(sum(seniors, (s) => shift[s.name][d]).ge(1), `senior_duty_${d}`);
  }

  // Rule 3: Max working days per staff member
  for (const s of staffList) {
    m.addConstraint(sum([...days], (d) => shift[s.name][d]).le(s.maxShifts), `max_shifts_${s.name}`);
  }

  // Rule 4: Named day-off requests (shift[staff][day] <= 0)
  for (const req of dayOffRequests) {
    m.addConstraint(shift[req.staff][req.day].le(0), `day_off_${req.staff}_${req.day}`);
  }

  return { model: m, shift };
}

async function runShiftScheduling() {
  // Part 1: Solving a Feasible Schedule with HiGHS
  const { model: m1 } = buildShiftModel("FeasibleRoster", [
    { staff: "Alice", day: "Sun" },
    { staff: "Bob", day: "Mon" },
    { staff: "Charlie", day: "Sat" },
    { staff: "Diana", day: "Wed" },
  ]);
  const s1 = await m1.solve();
  console.log(`Part 1 (HiGHS): Status=${s1}, Optimal Weekly Payroll=$${m1.objectiveValue}`);

  // Part 2: Diagnosing Conflicting Saturday Vacation Requests with Z3
  const { model: m2 } = buildShiftModel("ConflictRoster", [
    { staff: "Alice", day: "Sat" },
    { staff: "Bob", day: "Sat" },
    { staff: "Charlie", day: "Sat" },
    { staff: "Diana", day: "Wed" },
  ]);
  const res2 = await m2.check("z3");
  console.log(`Part 2 (Z3 Check): Status=${res2.status}`);
  console.log("Conflicting Constraint Subset (unsatCore):", m2.unsatCore);
}

runShiftScheduling();
```

</CodeRunner>
