# Constraint Programming (CP) Modeling

WaSHI allows you to formulate both **Mathematical Optimization (LP / MIP / Convex QP)** and **Constraint Programming (CP)** problems through the same TypeScript algebraic modeling API (`Model`, `expr`, `sum`, `dot`). When you solve with bundled **Pumpkin** (`@ohtaman/washi/solvers/pumpkin`), global predicates (`distinct`, `disjoint`, `cumulative`, `allowed`) and piecewise/element primitives (`max`, `min`, `abs`, `at`) run on native Lazy Clause Generation (LCG) propagators instead of Big-M or time-indexed 0-1 MIP linearizations.

---

## 1. MIP vs. CP Modeling Mindset

In **MIP (HiGHS / GLPK)**, combinatorial decisions are typically encoded with large matrices of 0-1 binary variables $x_{i,t} \in \{0, 1\}$ and Big-M inequalities so a simplex/branch-and-cut solver can tighten continuous LP relaxations.

In **CP (Pumpkin)**, you model **what** each entity chooses directly using finite-domain integers (`m.integer(keys, { lb, ub })`) and declarative **global constraints**:

| Modeling Dimension | MIP Pattern (`HiGHS` / `GLPK`) | CP Pattern (`Pumpkin`) | SMT (`Z3`) |
| :--- | :--- | :--- | :--- |
| **Start times / Slots** | Time-indexed binaries $x_{i,t}$ or pairwise Big-M precedence binaries | Bounded integer start variables `start[i]` in `[0, H]` | Unbounded/bounded integer or real variables |
| **Machine / Worker capacity** | $\sum_i d_i x_{i,t} \le C$ for every discrete time slot $t$ | Single horizon-independent `cumulative(tasks, C)` | Event-point load formulas |
| **Unary non-overlap** | Pairwise Big-M disjunctions ($y_{ij} \in \{0,1\}$) | Native `disjoint(tasks)` edge-finding propagator | Pairwise `Or` disjunctions |
| **Permutation / Matching** | Doubly stochastic binary assignment matrix $x_{i,j} \in \{0, 1\}$ | Integer slot variables `machine[i]` in `[0, N-1]` + `distinct(machine)` | Native `ctx.Distinct` |
| **Cost / Tuple lookup** | $\sum_k c_k b_k$ with $\sum_k b_k = 1$ convex-hull binaries | Native `at(costs, indexVar)` & `allowed` / `not(allowed)` tables | Nested `If` expressions |
| **When to choose** | Continuous flows, blending, LP duals/shadow prices, quadratic objectives (`QuadExpr`), tight LP relaxations | Scheduling horizons, cumulative/disjunctive resources, permutations, table compatibility, zero-`COOP`/`COEP` `unsatCore` | Continuous non-integer logic (`Continuous` inside `not`/`implies`), formal proofs |

---

## 2. Interval & Resource Scheduling (`disjoint`, `cumulative`, `max`)

Time-indexed MIP formulations create $O(|T| \cdot H)$ binary variables and capacity rows, which quickly blows up when scheduling horizons grow (WaSHI's MIP lowering rejects horizons exceeding 5,000 time steps or 25,000 pulse variables and recommends `{ solver: "pumpkin" }`).

In CP, each task is just **one bounded integer variable** `start[task]` paired with `disjoint` (exclusive unary machines) and `cumulative` (renewable worker/power pools). Because interval propagators reason directly about earliest/latest start intervals and energetic overload, scheduling models stay compact regardless of horizon granularity.

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

// Single CNC spindle shared between mill and drill
m.constraint(
  disjoint([
    { start: start.mill, duration: duration.mill },
    { start: start.drill, duration: duration.drill },
  ]),
  "single_cnc"
);

// At most 2 operators working simultaneously across all tasks
m.constraint(
  cumulative(
    tasks.map((t) => ({ start: start[t], duration: duration[t], demand: workers[t] })),
    2
  ),
  "operator_pool"
);

m.objective(minimize(max(tasks.map((t) => expr`${start[t]} + ${duration[t]}`))));
await m.solve();
```

See the full runnable project scheduling walkthrough in [Resource-Constrained Project Scheduling (RCPSP)](../examples/project-scheduling.md).

---

## 3. Combinatorial Assignment, Table Rules & Element Lookup (`distinct`, `allowed`, `at`)

Instead of an $N \times M$ binary matrix $x_{j,m} \in \{0, 1\}$, assign each job a single bounded integer variable `machine[job]` with domain $\{0, \dots, M-1\}$:

- **`distinct(machine)`**: Forces every job onto a separate machine using Pumpkin's `all_different` propagator.
- **`allowed(vars, tuples)` / `not(allowed(vars, tuples))`**: Encodes arbitrary compatibility or incompatibility rules between discrete decisions without manual Big-M algebra.
- **`at(costs, indexVar)`**: Looks up a numeric cost from `costs[indexVar]` using Pumpkin's native `element` propagator—avoiding $M$ selector binary variables per job.

```typescript
import { Model, expr, distinct, allowed, not, at, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("MachineAssignmentCP", { solver: "pumpkin" });
const jobs = ["jobA", "jobB", "jobC"] as const;
const machine = m.integer(jobs, { lb: 0, ub: 2, prefix: "machine" });

const costA = [5, 10, 40];
const costB = [20, 15, 30];
const costC = [45, 30, 25];

// Each job runs on a distinct machine (0, 1, or 2)
m.constraint(distinct(machine), "one_job_per_machine");

// Safety interlock: Job A on Machine 0 cannot pair with Job B on Machine 1
m.constraint(not(allowed([machine.jobA, machine.jobB], [[0, 1]])), "interlock_pair");

// Variable-indexed cost lookup via 0-based Element primitive at(table, indexVar)
m.objective(
  minimize(
    expr`at(${costA}, ${machine.jobA}) + at(${costB}, ${machine.jobB}) + at(${costC}, ${machine.jobC})`
  )
);
await m.solve();
```

---

## 4. Domain Tightening, Symmetry Breaking & Conflict Diagnosis

### Keep Integer Domains Finite and Tight
Pumpkin uses signed 32-bit integer propagators and rejects `Continuous`, fractional, or unbounded variables (`lb: -Infinity` or `ub: Infinity`). Every `m.integer()` variable on Pumpkin must have finite integer `[lb, ub]` within $[-(2^{30} - 1),\, 2^{30} - 1]$ (see [Pumpkin Domain Preconditions](../solvers/pumpkin.md#domain-api-preconditions)). Tight horizons directly shrink propagator domains and accelerate conflict learning.

### Break Permutation Symmetry with Strict Ordering (`<`)
When selecting $k$ items into $k$ interchangeable slots (`slot[0]`, ..., `slot[k-1]`), all $k!$ permutations have identical cost, forcing a branch-and-bound or CP search tree to explore symmetric duplicates. Adding strict inequality ordering `slot[0] < slot[1] < ...` simultaneously enforces all-different and collapses all $k!$ permutations into a single canonical sequence:

```typescript
import { Model, expr, at, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const m = new Model("SymmetryBreakingCP", { solver: "pumpkin" });
const latencyMs = [600, 380, 420, 470, 550];
const slot = m.integer(3, { lb: 0, ub: 4, prefix: "slot" });

// Strict ascending order enforces all-different AND eliminates 3! = 6 permutation symmetries
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
```

### Warm Starts & Zero-`COOP`/`COEP` Conflict Diagnosis
- **Warm Starts (`initialValue`)**: Provide feasible domain hints via `{ initialValue: val }` on `m.integer()` or `m.binary()` to seed Pumpkin's value selection (`WarmStart` brancher).
- **Conflict Diagnosis (`m.check()`)**: If a CP schedule or rule set returns `"Infeasible"`, calling `await m.check({ solver: "pumpkin" })` (without changing any constraints or adding `COOP`/`COEP` headers in browsers) extracts `unsatCore` / `conflicts` identifying which named precedence, resource, or deadline rules collide—see [Conflict Diagnosis (`unsatCore`)](./unsat-core.md).
