# Constraint Programming (CP) Modeling

WaSHI lets you write both **Mathematical Optimization (LP / MIP / QP)** and **Constraint Programming (CP)** models using the same TypeScript API (`Model`, `expr`, `sum`, `dot`).
When you use the bundled **Pumpkin** solver (`@ohtaman/washi/solvers/pumpkin`), scheduling, resource-capacity, all-different, and table-lookup constraints are solved directly without converting everything into large 0-1 MIP matrices.

---

## 1. When to Use CP (Pumpkin) vs. MIP (HiGHS)

In **MIP (`HiGHS` / `GLPK`)**, you typically model choices with 0-1 binary variables (such as $x_{i,t} \in \{0, 1\}$ for every task and time slot). That works well for continuous flows and linear budgets, but grows huge when time horizons or combinations expand.

In **CP (`Pumpkin`)**, you model *what* each item chooses directly as a bounded integer (for example, `start[task]` in `[0, 20]` or `machine[job]` in `[0, 2]`), and connect them with high-level constraints:

| Task / Pattern | MIP (`HiGHS` / `GLPK`) | CP (`Pumpkin`) |
| :--- | :--- | :--- |
| **Start times** | One 0-1 variable per task and time slot | One integer variable `start[i]` per task |
| **Non-overlapping tasks** | Pairwise ordering binaries + Big-M inequalities | `disjoint(tasks)` |
| **Shared worker / machine capacity** | One linear sum constraint per time step | `cumulative(tasks, capacity)` |
| **One-to-one assignment** | 2D 0-1 assignment matrix | `machine[i]` + `distinct(machine)` |
| **Cost lookup by choice** | Sum over 0-1 selector variables | `at(costs, indexVar)` |
| **Best suited for** | Continuous flows, blending, quadratic objectives, dual prices | Scheduling, resource limits, permutations, compatibility tables |

> [!TIP]
> If your model uses `Continuous` variables, fractional coefficients, or quadratic objectives, use `HiGHS` (or `Z3` for continuous logical rules). If your model uses bounded integers and booleans for scheduling, routing, or assignment, try `Pumpkin`.

---

## 2. Scheduling Tasks & Shared Resources (`disjoint`, `cumulative`, `max`)

With MIP, splitting a 10,000-step horizon into 0-1 time-slot variables creates tens of thousands of variables and rows (WaSHI's MIP converter rejects horizons over 5,000 steps or 25,000 slot variables and recommends `{ solver: "pumpkin" }`).

With Pumpkin, each task only needs **one integer variable** (`start[task]`), regardless of how fine-grained the timeline is:

- **`disjoint(tasks)`**: Ensures no two tasks in the list run at the same time (e.g., sharing a single machine).
- **`cumulative(tasks, capacity)`**: Ensures total resource demand (e.g., workers or power) never exceeds `capacity` at any moment.
- **`max(...)`**: Computes the makespan (the latest finish time across all tasks) so you can minimize total duration.

```typescript
import { Model, expr, disjoint, cumulative, max, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("IntervalSchedulingCP", { solver: "pumpkin" });
const tasks = ["prep", "mill", "drill", "coat"] as const;
const duration = { prep: 3, mill: 4, drill: 3, coat: 2 };
const workers = { prep: 1, mill: 1, drill: 1, coat: 2 };
const start = m.integer(tasks, { lb: 0, ub: 20, prefix: "start" });

// Precedence rules: prep -> (mill, drill) -> coat
m.constraint(expr`${start.prep} + 3 <= ${start.mill}`, "mill_after_prep");
m.constraint(expr`${start.prep} + 3 <= ${start.drill}`, "drill_after_prep");
m.constraint(expr`${start.mill} + 4 <= ${start.coat}`, "coat_after_mill");
m.constraint(expr`${start.drill} + 3 <= ${start.coat}`, "coat_after_drill");

// Single CNC machine shared between mill and drill
m.constraint(
  disjoint([
    { start: start.mill, duration: duration.mill },
    { start: start.drill, duration: duration.drill },
  ]),
  "single_cnc"
);

// At most 2 operators working at the same time
m.constraint(
  cumulative(
    tasks.map((t) => ({ start: start[t], duration: duration[t], demand: workers[t] })),
    2
  ),
  "operator_pool"
);

m.objective(minimize(max(tasks.map((t) => expr`${start[t]} + ${duration[t]}`))));
await m.solve();
console.log("Makespan:", m.objectiveValue);
```

See the full walkthrough in [Resource-Constrained Project Scheduling (RCPSP)](../examples/project-scheduling.md).

---

## 3. Assignment, Compatibility Tables & Cost Lookup (`distinct`, `allowed`, `at`)

Instead of an $N \times M$ matrix of 0-1 variables, give each job one integer variable `machine[job]` with values `0` through `M - 1`:

- **`distinct(machine)`**: Forces every job onto a different machine.
- **`allowed(vars, tuples)` / `not(allowed(vars, tuples))`**: Allows or forbids specific value combinations without manual Big-M formulas.
- **`at(costs, indexVar)`**: Looks up `costs[indexVar]` directly inside an `expr` or objective.

```typescript
import { Model, expr, distinct, allowed, not, at, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("MachineAssignmentCP", { solver: "pumpkin" });
const jobs = ["jobA", "jobB", "jobC"] as const;
const machine = m.integer(jobs, { lb: 0, ub: 2, prefix: "machine" });

const costA = [5, 10, 40];
const costB = [20, 15, 30];
const costC = [45, 30, 25];

// Each job runs on a separate machine (0, 1, or 2)
m.constraint(distinct(machine), "one_job_per_machine");

// Forbid placing Job A on Machine 0 while Job B is on Machine 1
m.constraint(not(allowed([machine.jobA, machine.jobB], [[0, 1]])), "interlock_pair");

// Look up each job's cost by its assigned machine index
m.objective(
  minimize(
    expr`at(${costA}, ${machine.jobA}) + at(${costB}, ${machine.jobB}) + at(${costC}, ${machine.jobC})`
  )
);
await m.solve();
console.log("Total cost:", m.objectiveValue);
```

---

## 4. Practical Tips for Pumpkin Models

### Keep Integer Bounds Finite and Tight
Pumpkin only supports finite integers within $[-(2^{30} - 1),\, 2^{30} - 1]$. It rejects `Continuous` variables, fractional values, and unbounded variables (`-Infinity` / `Infinity`). Tighter `[lb, ub]` ranges shrink the search space and speed up solving. See [Pumpkin Domain Preconditions](../solvers/pumpkin.md#domain-api-preconditions).

### Break Symmetry with Strict Ordering (`<`)
When picking $k$ items into $k$ interchangeable slots (`slot[0]`, ..., `slot[k-1]`), any reordering of the same $k$ items has the exact same cost, which forces the solver to check $k!$ duplicate solutions. Adding `slot[0] < slot[1] < ...` enforces uniqueness and eliminates those duplicate permutations at once:

```typescript
import { Model, expr, at, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("SymmetryBreakingCP", { solver: "pumpkin" });
const latencyMs = [600, 380, 420, 470, 550];
const slot = m.integer(3, { lb: 0, ub: 4, prefix: "slot" });

// Strict ascending order enforces uniqueness and removes 3! = 6 duplicate orderings
m.constraint([
  expr`${slot[0]} < ${slot[1]}`,
  expr`${slot[1]} < ${slot[2]}`,
]);

m.objective(
  minimize(
    expr`at(${latencyMs}, ${slot[0]}) + at(${latencyMs}, ${slot[1]}) + at(${latencyMs}, ${slot[2]})`
  )
);
await m.solve();
console.log("Best 3 latencies total:", m.objectiveValue);
```

### Warm Starts & Conflict Diagnosis
- **Warm starts (`initialValue`)**: Pass `{ initialValue: val }` to `m.integer()` or `m.binary()` to give Pumpkin a starting hint for value selection.
- **Conflict diagnosis (`m.check()`)**: If a CP model returns `"Infeasible"`, call `await m.check({ solver: "pumpkin" })` to find which named rules conflict (works in browsers without `COOP`/`COEP` headers). See [Conflict Diagnosis (`unsatCore`)](./unsat-core.md).
