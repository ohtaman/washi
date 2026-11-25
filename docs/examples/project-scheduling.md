# Resource-Constrained Project Scheduling (CP / Pumpkin)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Constraint Programming (RCPSP) / Unsat Core Diagnosis | Pumpkin (`@ohtaman/washi/solvers/pumpkin`) | `m.integer()`, `disjoint()`, `cumulative()`, `max()`, `and()`, `m.check()` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=project_scheduling">Playground (Schedule)</a></li><li><a href="https://washi.ohtaman.dev/demo/?preset=project_conflict_unsat">Playground (Conflict)</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/15-project-scheduling-cp.ts">Source Code</a></li><li><a href="/guide/constraint-programming">CP Modeling Guide</a></li></ul> |

The **Resource-Constrained Project Scheduling Problem (RCPSP)** schedules project tasks to minimize the maximum completion time, known as the **makespan**. It balances task precedence order, exclusive single-machine equipment, and limited team headcount at the same time.

Using WaSHI's bundled **Pumpkin** solver (`@ohtaman/washi/solvers/pumpkin`):
1. Each task needs only one integer start variable (`start[task]`), avoiding binary variables for every `(task, hour)` pair.
2. When a maintenance window or tight deadline makes the schedule `"Infeasible"`, `m.check()` isolates the conflicting rules (`unsatCore`) on the same model.

## Problem Inputs

We schedule **6 hardware prototype tasks** with a start-time horizon of `24` hours (`horizon = 24`). The team has `crewCapacity = 3` engineers and 1 shared test and calibration rig:

| Task | Duration | Crew | Dependencies | Shared Rig (`disjoint`) |
| :--- | :--- | :--- | :--- | :--- |
| `chassis` | 4h | 2 | — | No |
| `board` | 3h | 2 | — | No |
| `firmware` | 4h | 1 | — | **Yes** |
| `assembly` | 3h | 2 | `chassis`, `board` | No |
| `calib` | 3h | 1 | `board` | **Yes** |
| `test` | 2h | 2 | `assembly`, `firmware`, `calib` | **Yes** |

Ignoring the crew limit, `chassis` and `board` can start together at `0h`, giving a `9h` critical path (`chassis 4h -> assembly 3h -> test 2h`). Because `crewCapacity = 3`, `chassis` and `board` each need 2 engineers and cannot overlap (`2 + 2 = 4 > 3`). Running them back-to-back delays `assembly` until `7h`, raising the minimum makespan from `9h` to **`12h`**.

## Implementation in WaSHI

<CodeRunner preset="project_scheduling">

```typescript
import { Model, expr, disjoint, cumulative, max, and, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

async function runProjectScheduling() {
  const horizon = 24;
  const crewCapacity = 3;
  const tasks = [
    { id: "chassis", duration: 4, crew: 2, usesRig: false },
    { id: "board", duration: 3, crew: 2, usesRig: false },
    { id: "firmware", duration: 4, crew: 1, usesRig: true },
    { id: "assembly", duration: 3, crew: 2, usesRig: false },
    { id: "calib", duration: 3, crew: 1, usesRig: true },
    { id: "test", duration: 2, crew: 2, usesRig: true },
  ] as const;

  const m = new Model("PrototypeRCPSP", { solver: "pumpkin" });
  const start = m.integer(tasks.map((t) => t.id), { lb: 0, ub: horizon, prefix: "start" });

  // 1. Precedence network
  m.constraint(expr`${start.chassis} + 4 <= ${start.assembly}`, "assembly_after_chassis");
  m.constraint(expr`${start.board} + 3 <= ${start.assembly}`, "assembly_after_board");
  m.constraint(expr`${start.board} + 3 <= ${start.calib}`, "calib_after_board");
  m.constraint(expr`${start.assembly} + 3 <= ${start.test}`, "test_after_assembly");
  m.constraint(expr`${start.firmware} + 4 <= ${start.test}`, "test_after_firmware");
  m.constraint(expr`${start.calib} + 3 <= ${start.test}`, "test_after_calib");

  // 2. Exclusive shared rig & 3-engineer cumulative limit
  m.constraint(
    disjoint(tasks.filter((t) => t.usesRig).map((t) => ({ start: start[t.id], duration: t.duration }))),
    "single_rig"
  );
  m.constraint(
    cumulative(
      tasks.map((t) => ({ start: start[t.id], duration: t.duration, demand: t.crew })),
      crewCapacity
    ),
    "crew_limit"
  );

  // 3. Minimize project makespan: max_t (start[t] + duration[t])
  const makespan = max(tasks.map((t) => expr`${start[t.id]} + ${t.duration}`));
  m.objective(minimize(makespan));

  const status = await m.solve();
  const optMakespan = m.objectiveValue;
  const report = m.verify();
  console.log(`Status: ${status} (valid: ${report.valid}), Minimum Makespan: ${optMakespan}h`);
  for (const t of tasks) {
    const s = start[t.id].value ?? 0;
    console.log(`  ${t.id}: [${s}h, ${s + t.duration}h) crew=${t.crew}${t.usesRig ? " [Rig]" : ""}`);
  }

  // 4. Diagnose an impossible rush deadline when the rig is offline for maintenance [0, 6)
  // (restricting firmware and calib to start >= 6; test is already >= 7 via precedence)
  m.constraint(
    and(expr`${start.firmware} >= 6`, expr`${start.calib} >= 6`),
    "rig_maintenance_window"
  );
  m.constraint(expr`${makespan} <= 13`, "rush_ship_deadline");

  const diag = await m.check();
  console.log(`Deadline Check: ${diag.status}`);
  console.log(`Unsat Core: ${(diag.unsatCore ?? []).join(", ")}`);
}

runProjectScheduling();
```

</CodeRunner>

## Practical Notes

### Compact Scheduling with Global Constraints

In Constraint Programming, **global constraints** express recurring scheduling patterns directly over groups of variables. Here, `disjoint()` keeps tasks on the shared rig from overlapping, and `cumulative()` caps simultaneous crew usage at `3`. Because start times are bounded integers rather than hourly binary flags, the model stays small even with a longer horizon or finer time units.

### Snapshot `m.objectiveValue` Before `m.check()`

Calling `await m.check()` on the same `Model` clears the previous `solve()` outputs, resetting `m.objectiveValue` to `null`. Always store optimization results in local variables before running a conflict check.

### Why the `13h` Rush Deadline Is Infeasible (`unsatCore`)

When the maintenance window and `<= 13h` deadline are added, `m.check()` returns `"Unsat"` and extracts the conflicting constraints (`unsatCore`) while excluding the unrelated `crew_limit`:

1. `rig_maintenance_window` delays both `firmware` and `calib` until at least `6h`.
2. Because `chassis` takes `4h` and `assembly` takes `3h`, `assembly_after_chassis` and `test_after_assembly` delay `test` until at least `7h`.
3. Under `single_rig`, the three rig tasks (`firmware` 4h, `calib` 3h, `test` 2h) need `9h` of non-overlapping rig time, and none can start before `6h`.
4. As a result, the earliest possible finish is `6 + 9 = 15h`, which conflicts with `rush_ship_deadline` (`<= 13h`).
