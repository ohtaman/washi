# Resource-Constrained Project Scheduling (CP / Pumpkin)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| CP / LCG (RCPSP & Unsat Core) | Pumpkin (`@ohtaman/washi/solvers/pumpkin`) | `m.integer()`, `disjoint()`, `cumulative()`, `max()`, `and()`, `m.check()` | <ul><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/15-project-scheduling-cp.ts">Source Code</a></li><li><a href="/guide/constraint-programming">CP Modeling Guide</a></li></ul> |

The **Resource-Constrained Project Scheduling Problem (RCPSP)** models project tasks governed simultaneously by **precedence dependencies**, **unary shared equipment** (disjunctive resource), and **limited renewable team headcount** (cumulative resource).

Using WaSHI's bundled **Pumpkin** solver (`@ohtaman/washi/solvers/pumpkin`):
1. Every task needs only **one finite-domain start variable** (`start[task]`), avoiding $O(|T| \cdot H)$ time-indexed binary variables.
2. When adding tighter maintenance windows or rush shipping deadlines causes infeasibility, `m.check()` extracts the conflicting rule subset (`unsatCore`) client-side with **zero `COOP` / `COEP` headers**.

## Problem Inputs

We schedule **6 hardware prototype tasks** over a 24-hour window (`crewCapacity = 3` engineers, 1 shared Hardware-in-the-Loop (HIL) calibration rig):

| Task | Duration | Crew | Dependencies | Shared Rig (`disjoint`) |
| :--- | :--- | :--- | :--- | :--- |
| `chassis` | 4h | 2 | — | No |
| `board` | 3h | 2 | — | No |
| `firmware` | 4h | 1 | — | **Yes** |
| `assembly` | 3h | 2 | `chassis`, `board` | No |
| `calib` | 3h | 1 | `board` | **Yes** |
| `test` | 2h | 2 | `assembly`, `firmware`, `calib` | **Yes** |

Notice that ignoring crew capacity gives a naive critical path of `9h` (`chassis 4h -> assembly 3h -> test 2h`), whereas respecting the `crewCapacity = 3` constraint prevents `{chassis, board, assembly}` (2 engineers each) from overlapping, making the true minimum makespan **`12h`**.

## Implementation in WaSHI

<CodeRunner>

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

  // 2. Exclusive HIL / calibration rig & 3-engineer cumulative limit
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
  const report = m.validateSolution();
  console.log(`Status: ${status} (valid: ${report.valid}), Minimum Makespan: ${optMakespan}h`);
  for (const t of tasks) {
    const s = start[t.id].value ?? 0;
    console.log(`  ${t.id}: [${s}h, ${s + t.duration}h) crew=${t.crew}${t.usesRig ? " [Rig]" : ""}`);
  }

  // 4. Diagnose an impossible rush deadline when the rig is offline for maintenance [0, 6)
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

- **Why Pumpkin shines here**: Combining `disjoint` (edge-finding) and `cumulative` (time-table propagation) directly on bounded integers lets Pumpkin learn why a schedule bottlenecks (`crew_limit` or `single_rig`) cleanly through Lazy Clause Generation, with zero time-indexed binary variables.
- **Snapshot `m.objectiveValue` before `m.check()`**: Calling `await m.check()` on the same `Model` clears prior `solve()` fields (`m.objectiveValue` becomes `null`), so capture optimization outputs before running feasibility/conflict checks.
- **Client-side `unsatCore` without `COOP` / `COEP`**: Notice that `diag.unsatCore` excludes unrelated `crew_limit` while isolating the rig maintenance (`firmware >= 6`, `calib >= 6`), `assembly -> test` chain (`test >= 7`), unary `single_rig` total of 9h ($\implies \text{completion} \ge 15 > 13$), and `rush_ship_deadline`.
