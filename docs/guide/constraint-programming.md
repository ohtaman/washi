# Constraint Programming (CP) Modeling

WaSHI lets you write both Mathematical Optimization (LP / MIP / QP) and Constraint Programming (CP) models with the same TypeScript API.
Using the bundled **Pumpkin** solver (`@ohtaman/washi/solvers/pumpkin`), you can model scheduling, resource limits, all-different rules, and table lookups directly without expanding them into large 0-1 matrices.

---

## 1. When to Use CP (Pumpkin) vs. MIP (HiGHS / GLPK)

The two paradigms differ in how they represent decisions and prune the search space.

### Mixed-Integer Programming (`HiGHS` / `GLPK`)

MIP represents decisions with continuous and integer (including 0-1) variables, expresses rules as linear inequalities, and solves them with LP relaxation and branch-and-bound.
This excels at continuous flows, linear budgets, quadratic objectives, and LP dual analysis.
However, discretizing fine-grained timelines or expanding combinatorial structures into 0-1 variables can make the model grow huge.

### Constraint Programming (`Pumpkin`)

CP assigns each decision a finite integer domain and connects variables with **global constraints**—high-level predicates that express structured combinatorial rules across groups of variables.
During search, **domain propagation** automatically prunes impossible values from each variable's domain whenever variable domains or constraints tighten, keeping models compact.

The table below shows how common modeling patterns map between MIP and CP:

| Task / Pattern | MIP (`HiGHS` / `GLPK`) | CP (`Pumpkin`) |
| :--- | :--- | :--- |
| **Start times** | One 0-1 variable per task and time slot | One integer variable `start[i]` per task |
| **Non-overlapping tasks** | Pairwise ordering binaries + Big-M inequalities | `disjoint(tasks)` |
| **Shared worker / machine capacity** | One linear sum constraint per time step | `cumulative(tasks, capacity)` |
| **One-to-one assignment** | 2D 0-1 assignment matrix | `machine[i]` + `distinct(machine)` |
| **Value / cost lookup by choice** | Weighted sum over 0-1 selector variables | `at(costs, indexVar)` |
| **Best suited for** | Continuous flows, blending, quadratic objectives, dual analysis | Scheduling, resource limits, permutations, compatibility tables |

> [!TIP]
> Use `HiGHS` when your model requires `Continuous` variables, decimal coefficients, or quadratic objectives, or `Z3` for continuous logical rules.
> Try `Pumpkin` when your model uses bounded integers and Booleans for scheduling, routing, or combinatorial assignment.

---

## 2. Scheduling Tasks & Shared Resources (`disjoint`, `cumulative`, `max`)

Discretizing a long timeline into 0-1 time-slot variables creates tens of thousands of MIP variables.
WaSHI's MIP converter rejects `cumulative` horizons above 5,000 steps or 25,000 slot variables and recommends `{ solver: "pumpkin" }`.

With Pumpkin, each task needs only **one integer variable** (`start[task]`), regardless of horizon granularity.
Three primitives cover most interval-scheduling models:

- **`disjoint(tasks)`**: Takes task objects `{ start, duration }` and forbids any two intervals `[start, start + duration)` from overlapping on a shared single machine.
- **`cumulative(tasks, capacity)`**: Takes task objects `{ start, duration, demand }` and enforces that total active resource demand never exceeds `capacity` at any moment.
- **`max(...)`**: Computes the **makespan**—the latest completion time across all tasks, $\max_i (\text{start}_i + \text{duration}_i)$—so you can minimize total schedule length.

```typescript
import { Model, expr, disjoint, cumulative, max, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("IntervalSchedulingCP", { solver: "pumpkin" });
const tasks = ["prep", "mill", "drill", "coat"] as const;
const duration = { prep: 3, mill: 4, drill: 3, coat: 2 };
const workers = { prep: 1, mill: 1, drill: 1, coat: 2 };
const start = m.integer(tasks, { lb: 0, ub: 20, prefix: "start" });

// Precedence rules: prep -> (mill, drill) -> coat
m.constraint(expr`${start.prep} + ${duration.prep} <= ${start.mill}`, "mill_after_prep");
m.constraint(expr`${start.prep} + ${duration.prep} <= ${start.drill}`, "drill_after_prep");
m.constraint(expr`${start.mill} + ${duration.mill} <= ${start.coat}`, "coat_after_mill");
m.constraint(expr`${start.drill} + ${duration.drill} <= ${start.coat}`, "coat_after_drill");

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

Instead of an $N \times M$ matrix of 0-1 assignment variables, give each job a single bounded integer variable `machine[job]` ranging from `0` to `M - 1`:

- **`distinct(machine)`**: Global all-different constraint forcing every job onto a distinct machine.
- **`allowed(vars, tuples)` / `not(allowed(vars, tuples))`**: Global table constraint permitting or forbidding explicit value tuples without Big-M inequalities.
- **`at(costs, indexVar)`**: Variable-indexed lookup returning `costs[indexVar]` directly inside an `expr` or objective.

```typescript
import { Model, expr, distinct, allowed, not, minimize } from "@ohtaman/washi";
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

Pumpkin supports only finite integers within $[-(2^{30} - 1),\, 2^{30} - 1]$.
It rejects `Continuous` variables, non-integer coefficients or constants, and infinite bounds (`-Infinity` / `Infinity`).
Tighter `[lb, ub]` intervals shrink domains upfront and make domain propagation more effective.
See [Pumpkin Domain Preconditions](../solvers/pumpkin.md#domain-api-preconditions).

### Break Symmetry with Strict Ordering (`<`)

When picking $k$ distinct items into $k$ interchangeable slots (`slot[0]`, ..., `slot[k-1]`), every permutation of the same items has the same objective value.
Without symmetry breaking, the solver wastes time checking $k!$ equivalent orderings.
Adding `slot[0] < slot[1] < ...` enforces both uniqueness and a single canonical order:

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";
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

- **Warm starts (`initialValue`)**: Pass `{ initialValue: val }` to `m.integer()` or `m.binary()` to guide Pumpkin's initial value selection.
- **Conflict diagnosis (`m.check()`)**: If a CP model returns `"Infeasible"`, call `await m.check({ solver: "pumpkin" })` to pinpoint conflicting named constraints. See [Conflict Diagnosis (`unsatCore`)](./unsat-core.md).
