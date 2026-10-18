# Objectives & Solving (`m.solve` & `m.check`)

The objective function defines the goal of mathematical optimization—whether to maximize profits, minimize costs, or minimize quadratic risk variance. When you only need to verify constraint feasibility or solve pure SMT logic, you can also run `m.check()` without an objective.

---

## Setting the Objective Function

Set the objective direction and formula declaratively using `m.objective(maximize(...))` or `m.objective(minimize(...))`:

```typescript
import { Model, expr, maximize, minimize } from "@ohtaman/washi";

const m = new Model("ProductionRevenue");
const x = m.integer("x", { lb: 0 });
const y = m.integer("y", { lb: 0 });

// Maximize revenue: 50*x + 40*y
m.objective(maximize(expr`50 * ${x} + 40 * ${y}`));

// Or minimize cost:
// m.objective(minimize(expr`10 * ${x} + 15 * ${y}`));
```

Calling `m.objective()` with no arguments returns the current objective expression (`LinExpr | QuadExpr`). If you omit setting an objective, the model defaults to minimizing `0`.

---

## 🚀 Solving the Model (`m.solve()` vs. `m.check()`)

WaSHI provides two asynchronous execution entrypoints:

| Method | Return Value | Purpose |
| :--- | :--- | :--- |
| **`await m.solve(options?)`** | `Promise<SolverStatus>` | Optimizes the objective (`Minimize` or `Maximize`) subject to all constraints. Populates primal values, objective value, MIP bounds/gaps, and LP duals/slacks. |
| **`await m.check(options?)`** | `Promise<CheckResult>` | Checks constraint satisfiability without an objective. Returns `{ status, values, conflicts?, unsatCore?, runTime? }` where `values: Record<string, number \| boolean>` contains both numeric and Boolean variable assignments. Ideal for SMT/SAT verification and Z3 `unsatCore` extraction. |

```typescript
const status = await m.solve({
  timeLimit: 10.0, // Timeout in seconds
  mipGap: 0.01,    // Stop within 1% of global optimum
  verbose: false,  // Enable/disable solver console logging
});
```

### Solve Options (`SolveOptions`)

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `solver` | `"highs"` \| `"z3"` \| `"glpk"` \| `Solver` | Model's solver (`"highs"`) | Target solver plugin or instance for this run. |
| `timeLimit` | `number` | `undefined` | Maximum solve duration in seconds. |
| `mipGap` / `relGap` | `number` | `undefined` | Relative MIP optimality gap tolerance (e.g. `0.01` for 1%). |
| `absGap` | `number` | `undefined` | Absolute MIP optimality gap tolerance (HiGHS `mip_abs_gap`). |
| `presolve` | `"on"` \| `"off"` \| `"choose"` | `"choose"` | Controls solver presolve reduction prior to optimization. |
| `verbose` / `outputFlag` | `boolean` | `false` | When `true`, emits internal solver iteration logs. |
| `useWorker` | `boolean` | `true` (browser) | Offloads HiGHS to a dedicated Web Worker in browsers. Set `false` for main-thread execution. |
| `wasmUrl` | `string` | Auto-resolved | Custom URL to load `highs.wasm` in browser deployments. |
| `signal` | `AbortSignal` | `undefined` | Cooperative cancellation signal (`AbortController.signal`). |
| `onProgress` | `(e: SolveProgressEvent) => void` | `undefined` | Callback receiving live solver progress snapshots. |

You can also pass a solver name directly as the first argument: `await m.solve("glpk", { timeLimit: 5 })`.

---

## ⏱️ Real-Time Progress (`onProgress`) & Cancellation (`AbortSignal`)

For long-running MIP optimizations in interactive UIs, you can stream live branch-and-bound progress (`SolveProgressEvent`) and allow users to cancel the solve cleanly with `AbortController`:

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
      `Gap: ${event.mipGap !== undefined ? (event.mipGap * 100).toFixed(2) + "%" : "—"}`
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

### `SolveProgressEvent` Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `elapsedTime` | `number` | Elapsed solver time in seconds (optional alias: `elapsedSeconds`). |
| `phase` | `"simplex" \| "ipm" \| "mip" \| undefined` | Current solver phase when known. |
| `objectiveValue` | `number \| undefined` | Current best feasible incumbent objective value (MIP). |
| `objectiveBound` | `number \| undefined` | Current best proven dual / objective bound (MIP). |
| `relGap` / `mipGap` | `number \| undefined` | Current relative MIP optimality gap (`0.05` = 5%). |
| `absGap` | `number \| undefined` | Current absolute MIP optimality gap `\|objectiveValue - objectiveBound\|`. |
| `nodes` | `number \| undefined` | Branch-and-bound nodes explored so far. |
| `iterations` | `number \| undefined` | Solver iteration count (simplex, IPM, or MIP LP iterations). |
| `message` | `string \| undefined` | Raw progress line emitted by the solver. |

---

## 📊 Reading Results, Bounds & Solver Status

After solving, query the status, optimal values, and MIP optimality bounds on the `Model`:

```typescript
const status = await m.solve();

console.log("Status:", m.status);                         // e.g. "Optimal" or "Feasible"
console.log("Termination Reason:", m.terminationStatus);  // e.g. "Optimal", "TimeLimit", "Interrupted"
console.log("Has Primal Solution:", m.hasPrimalSolution); // true when x.value / m.objectiveValue are populated

// Objective & MIP Gap Metrics
console.log("Objective Value:", m.objectiveValue);        // Best primal objective (or null)
console.log("Objective Bound:", m.objectiveBound);        // Best dual bound (or null)
console.log("Relative Gap:", m.relGap);                   // Relative MIP gap (alias: m.mipGap)
console.log("Absolute Gap:", m.absGap);                   // |objectiveValue - objectiveBound|

// Individual & Bulk Variable Values
console.log("x =", x.value, "y =", y.value);
console.log(m.getValues({ x, y }));                       // { x: ..., y: ... }
```

### Understanding `m.status` vs. `m.terminationStatus`

When a MIP solver stops early due to a time limit, iteration limit, or `AbortSignal`, two distinct questions matter:
1. **Is there a usable solution?** (`m.hasPrimalSolution` / `m.status`)
2. **Why did the solver stop?** (`m.terminationStatus`)

If an integer-feasible incumbent was found before hitting `timeLimit` or `signal.abort()`, WaSHI sets `m.status = "Feasible"` (so you know `x.value` and `m.objectiveValue` hold a valid solution) and sets `m.terminationStatus = "TimeLimit"` (or `"Interrupted"`). If no incumbent was found before stopping, `m.hasPrimalSolution` is `false`, `m.terminationStatus` records why the solver stopped (`"TimeLimit"`, `"IterationLimit"`, or `"Interrupted"`), and `m.status` is `"TimeLimit"`, `"IterationLimit"`, or `"Unknown"` (when aborted via `AbortSignal` without an incumbent).

### All `SolverStatus` Values

| Status | `hasPrimalSolution` | Meaning |
| :--- | :--- | :--- |
| `"Optimal"` | `true` | Global optimal solution proven (within tolerances). |
| `"Feasible"` | `true` | Valid primal solution (incumbent) found, but optimality was not proven before stopping (`terminationStatus` indicates why: `"TimeLimit"`, `"IterationLimit"`, `"Interrupted"`, etc.). |
| `"Sat"` | `true` | Constraints are satisfiable (`m.check()`). |
| `"Infeasible"` | `false` | Proven mathematically infeasible; no solution satisfies all constraints. |
| `"Unsat"` | `false` | Logical/arithmetic constraints are unsatisfiable (`m.check()`). |
| `"Unbounded"` | `false` | Objective can improve indefinitely without violating constraints. |
| `"TimeLimit"` | `false` | Time limit reached before finding any feasible primal solution. |
| `"IterationLimit"` | `false` | Iteration limit reached before finding any feasible primal solution. |
| `"Unknown"` | `false` | Solver stopped inconclusively without a valid primal solution (including when cancelled via `AbortSignal` before finding an incumbent, where `terminationStatus === "Interrupted"`). |
| `"Error"` | `false` | Solver encountered an internal execution error. |
| `"NotSolved"` | `false` | Initial state before solving, or after the model has been mutated. |

---

## 🔄 Model Mutations & Execution Validity

A `Model` instance keeps its solution state synchronized across mutations made through `Model` methods and `Model` / `Var` / `Constraint` property setters:

1. **Post-Solve Mutations Reset Solution State**: Adding variables or constraints, updating the objective (`m.objective(...)`, `m.objectiveExpr = ...`, `m.sense = ...`), or modifying variable bounds/types (`v.lb`, `v.ub`, `v.type`) or constraint properties (`c.lhs`, `c.sense`, `c.rhs`) immediately resets `m.status` to `"NotSolved"`, clears `m.solution` and `m.objectiveValue`, and resets variable/constraint primal and dual values to `null`.
2. **Mid-Flight Mutations Discard Stale Runs**: If the model is modified via these APIs while an asynchronous `m.solve()` or `m.check()` call is in progress, the stale solver result is discarded, the model remains in `"NotSolved"`, and the in-flight promise rejects with an explicit error.
3. **Overlapping Executions**: Starting a new `m.solve()` or `m.check()` call supersedes any earlier in-flight call on the same model so out-of-order completions can never overwrite the latest run's state.
4. **Transactional Batch Edits**: If an invalid edit is rejected (including batch array calls like `m.constraint([...])`), the model rolls back the failed edit without leaving partial entities registered or invalidating an existing valid solution.

> [!NOTE]
> Renaming already-registered variables or constraints (e.g., reassigning `c.name` after registration) or mutating internal backing collections and ASTs directly (such as `c.lhs.terms`, `m.constraints.splice(...)`, or `BoolOp.children`) is unsupported and will be rejected by model integrity validation on the next solve/check/export call.
