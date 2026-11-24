# Objectives & Solving (`m.solve` & `m.check`)

The objective function defines the goal of mathematical optimization, such as maximizing profit, minimizing cost, or minimizing quadratic variance.
If you only need to check feasibility or solve logical rules without an objective, call `m.check()` instead.

---

## Setting the Objective Function

Set the optimization direction and formula declaratively with `m.objective(maximize(...))` or `m.objective(minimize(...))`:

```typescript
import { Model, expr, maximize, minimize } from "@ohtaman/washi";

const m = new Model("ProductionRevenue");
const x = m.integer("x", { lb: 0, ub: 40 });
const y = m.integer("y", { lb: 0, ub: 40 });

// Maximize revenue: 50*x + 40*y subject to resource capacity
m.objective(maximize(expr`50 * ${x} + 40 * ${y}`));
m.constraint(expr`2 * ${x} + 3 * ${y} <= 100`, "resource_limit");

// Or minimize cost:
// m.objective(minimize(expr`10 * ${x} + 15 * ${y}`));
```

Calling `m.objective()` with no arguments returns the current objective expression (`LinExpr | QuadExpr`).
If you omit setting an objective, the model defaults to minimizing `0`.

> [!TIP]
> For Min-Max load balancing, multi-objective optimization, and MIP gap tolerances (`relativeGap` / `absoluteGap`), see [Formulation Patterns & Optimization Tips](./formulation-tips.md#_4-multi-objective-mip-stopping-design).

---

## Solving the Model (`m.solve()` vs. `m.check()`)

WaSHI provides two asynchronous execution methods:

| Method | Return Value | Purpose |
| :--- | :--- | :--- |
| **`await m.solve(options?)`** | `Promise<SolverStatus>` | Optimizes the objective (`Minimize` or `Maximize`) subject to all constraints. Populates primal values, objective value, MIP bounds/gaps, and LP duals/slacks. |
| **`await m.check(options?)`** | `Promise<CheckResult>` | Checks satisfiability without an objective. Returns `{ status, values, conflicts?, unsatCore?, runTime? }` for CP/SMT checks and conflict diagnosis. |

```typescript
const status = await m.solve({
  timeLimit: 10.0,     // Timeout in seconds
  relativeGap: 0.01,   // Stop within 1% of global optimum
  outputFlag: false,   // Enable/disable solver console logging (HiGHS: outputFlag, GLPK: verbose)
});
```

### Solve Options (`SolveOptions`)

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `solver` | `string` \| `Solver` | Model's solver (`"highs"`) | Registered solver name (`"highs"`, `"pumpkin"`, `"z3"`, `"glpk"`, or custom) or `Solver` instance for this run. |
| `timeLimit` | `number` | `undefined` | Maximum solve duration in seconds. |
| `relativeGap` | `number` | `undefined` | Relative MIP optimality gap tolerance (for example, `0.01` for 1%). |
| `absoluteGap` | `number` | `undefined` | Absolute MIP optimality gap tolerance (HiGHS `mip_abs_gap`). |
| `presolve` | `"on"` \| `"off"` \| `"choose"` | `"choose"` | Controls solver presolve reduction prior to optimization. |
| `outputFlag` / `verbose` | `boolean` | `false` | Emits internal solver logs (`outputFlag` for HiGHS, `verbose` for GLPK). |
| `useWorker` | `boolean` | `true` (browser) | Runs HiGHS and Pumpkin in a browser Web Worker. Set `false` for main-thread browser runs; omit or set `false` in Node.js (explicit `true` fails). |
| `wasmUrl` | `string` | Auto-resolved | Custom URL to load `highs.wasm` or `pumpkin.wasm` in browser deployments. |
| `signal` | `AbortSignal` | `undefined` | Cancellation signal (`AbortController.signal`); see cancellation limitations below. |
| `onProgress` | `(e: SolveProgressEvent) => void` | `undefined` | Callback receiving live solver progress snapshots. |

You can also pass a solver name directly as the first argument: `await m.solve("glpk", { timeLimit: 5 })`.

---

## Reading Results, Bounds & Solver Status

After solving, inspect the status, optimal values, and MIP bounds directly on the `Model`:

```typescript
const status = await m.solve();

console.log("Status:", m.status);                         // e.g. "Optimal" or "Feasible"
console.log("Termination Reason:", m.terminationStatus);  // e.g. "Optimal", "TimeLimit", "Interrupted"
console.log("Has Primal Solution:", m.hasPrimalSolution); // true when x.value / m.objectiveValue are populated

// Objective & MIP Gap Metrics
console.log("Objective Value:", m.objectiveValue);        // Best primal objective (or null)
console.log("Objective Bound:", m.objectiveBound);        // Best dual bound (or undefined)
console.log("Relative Gap:", m.relativeGap);              // Relative MIP gap
console.log("Absolute Gap:", m.absoluteGap);              // |objectiveValue - objectiveBound|

// Variable Values (via .value or name-keyed m.values ReadonlyMap)
console.log("x =", x.value, "y =", y.value);
console.log("x by name:", m.values.get("x"));
```

> [!TIP]
> To independently check that returned values satisfy all bounds, integrality rules, and constraints within tolerance, call `m.verify()`.
> See [Verifying Solutions (`m.verify()`)](./unsat-core.md#verifying-solutions-m-verify).

### Understanding `m.status` vs. `m.terminationStatus`

When a MIP solver stops early due to a time limit, iteration limit, or `AbortSignal`, two separate questions matter:

1. **Is there a usable solution?** Check `m.hasPrimalSolution` or `m.status`.
2. **Why did the solver stop?** Check `m.terminationStatus`.

If the solver found a valid solution—called an **incumbent**—before hitting `timeLimit` or `signal.abort()`, WaSHI sets `m.status = "Feasible"`.
In that case, `x.value` and `m.objectiveValue` contain that incumbent, while `m.terminationStatus` records `"TimeLimit"` or `"Interrupted"`.
If no solution was found before stopping, `m.hasPrimalSolution` is `false` and `m.status` is `"TimeLimit"`, `"IterationLimit"`, or `"Unknown"`.

### All `SolverStatus` Values

| Status | `hasPrimalSolution` | Meaning |
| :--- | :--- | :--- |
| `"Optimal"` | `true` | Global optimal solution proven within tolerances. |
| `"Feasible"` | `true` | Valid solution found, but stopped before proving optimality (see `terminationStatus`). |
| `"Sat"` | `true` | Constraints are satisfiable (`m.check()`). |
| `"Infeasible"` | `false` | Proven mathematically infeasible; no solution satisfies all constraints. |
| `"Unsat"` | `false` | Logical or arithmetic constraints are unsatisfiable (`m.check()`). |
| `"Unbounded"` | `false` | Objective can improve indefinitely without violating constraints. |
| `"TimeLimit"` | `false` | Time limit reached before finding any feasible primal solution. |
| `"IterationLimit"` | `false` | Iteration limit reached before finding any feasible primal solution. |
| `"Unknown"` | `false` | Stopped without a solution (for example, cancelled via `AbortSignal` before finding one). |
| `"Error"` | `false` | Solver encountered an internal execution error. |
| `"NotSolved"` | `false` | Initial state before solving, or after the model has been mutated. |

---

## Real-Time Progress (`onProgress`) & Cancellation (`AbortSignal`)

For long-running MIP solves in interactive apps, you can stream branch-and-bound progress with `onProgress` and cancel runs with `AbortController`:

```typescript
const controller = new AbortController();

// Example: cancel if the user clicks a "Stop" button or after a custom condition
const status = await m.solve({
  signal: controller.signal,
  onProgress: (event) => {
    console.log(
      `[${event.elapsedTime.toFixed(1)}s] ` +
      `Best: ${event.objectiveValue ?? "—"}, ` +
      `Bound: ${event.objectiveBound ?? "—"}, ` +
      `Gap: ${event.relativeGap !== undefined ? (event.relativeGap * 100).toFixed(2) + "%" : "—"}`
    );

    // Optional: stop early as soon as a good-enough incumbent is found
    if (event.objectiveValue !== undefined && event.objectiveValue >= 1000) {
      controller.abort();
    }
  },
});

console.log("Status:", m.status);                   // "Feasible" (if an incumbent was found before abort) or "Unknown"
console.log("Termination:", m.terminationStatus);   // "Interrupted"
console.log("Has incumbent:", m.hasPrimalSolution); // true if an incumbent was available
```

> [!NOTE]
> **`AbortSignal` Behavior Across Backends**:
> - **Asynchronous preemptive cancellation**: On HiGHS and Pumpkin inside a browser Web Worker (`useWorker: true`), aborting terminates the worker immediately.
> - **Cooperative mid-solve cancellation**: On HiGHS and Pumpkin in Node.js or on the browser main thread (`useWorker: false`), aborting inside `onProgress` (and during Pumpkin search checkpoints) stops the active solve cleanly.
> - **Pre-solve cancellation only**: On GLPK and Z3, `AbortSignal` is checked only before starting a solve.

### `SolveProgressEvent` Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `elapsedTime` | `number` | Elapsed solver time in seconds (optional alias: `elapsedSeconds`). |
| `phase` | `"simplex" \| "ipm" \| "mip" \| undefined` | Current solver phase when known. |
| `objectiveValue` | `number \| undefined` | Current best feasible incumbent objective value (MIP). |
| `objectiveBound` | `number \| undefined` | Current best proven dual bound (MIP). |
| `relativeGap` | `number \| undefined` | Current relative MIP optimality gap (`0.05` = 5%). |
| `absoluteGap` | `number \| undefined` | Current absolute MIP optimality gap `\|objectiveValue - objectiveBound\|`. |
| `nodes` | `number \| undefined` | Branch-and-bound nodes explored so far. |
| `iterations` | `number \| undefined` | Solver iteration count (simplex, interior-point, or MIP LP iterations). |
| `message` | `string \| undefined` | Raw progress line emitted by the solver. |

---

## Model Mutations & Execution Validity

A `Model` keeps its solution state consistent across edits made through `Model` methods and `Model`, `Var`, and `Constraint` property setters.

### Post-Solve Mutations Reset State

Adding variables or constraints, or updating the objective via `m.objective()` or `m.sense`, immediately resets `m.status` to `"NotSolved"`.
The same reset applies when modifying variable fields (`v.lb`, `v.ub`, `v.type`) or constraint fields (`c.lhs`, `c.sense`, `c.rhs`).
This clears `m.solution` and `m.objectiveValue`, resets variable `value` and `reducedCost` to `null`, and resets constraint `dual` and `slack` to `null`.

### Mid-Flight & Overlapping Runs

- **Mid-flight mutations**: Modifying the model while an async `m.solve()` or `m.check()` is running discards the stale result, keeps `m.status` at `"NotSolved"`, and rejects the in-flight promise.
- **Overlapping calls**: Starting a new `m.solve()` or `m.check()` supersedes any earlier in-flight call on the same model so late completions cannot overwrite the latest state.
- **Atomic batch edits**: If a batch call such as `m.constraint([...])` contains an invalid item, WaSHI rolls back the entire call without leaving partial edits or clearing an existing valid solution.

> [!NOTE]
> Renaming already-registered variables or constraints, or mutating internal maps and ASTs directly (`c.lhs.terms`, `BoolOp.children`), is unsupported.
> Such edits are rejected by model integrity validation on the next solve, check, or export call.
