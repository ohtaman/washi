# Pumpkin Constraint Programming Solver

**Pumpkin** is an open-source Constraint Programming (CP) solver written in Rust and maintained by [ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin). WaSHI bundles Pumpkin (`v0.5.0`) as WebAssembly in `@ohtaman/washi/solvers/pumpkin` with zero extra packages.

Because Pumpkin runs single-threaded, browsers do not need `SharedArrayBuffer` or `COOP`/`COEP` headers (see [Cross-Origin Isolation](../getting-started/cross-origin.md)).

---

## When to Choose Pumpkin

| Problem Type | Recommended Solver | Why |
| :--- | :--- | :--- |
| **Scheduling, resource caps, & discrete global constraints** | **Pumpkin** (`@ohtaman/washi/solvers/pumpkin`) | Native propagation for `disjoint`, `cumulative`, `distinct`, and `allowed` with zero extra setup. |
| **Browser `unsatCore` without `COOP`/`COEP`** | **Pumpkin** (`m.check({ solver: "pumpkin" })`) | Extracts conflicting named constraints on bounded integer and boolean models in any static site or iframe. |
| **Linear, Mixed-Integer, & Quadratic Programming** | **[HiGHS](./highs.md)** (default) | Supports continuous variables, duals and slacks, convex quadratic objectives, and continuous relaxation. |
| **Logical rules with `Continuous` variables** | **[Z3](./z3.md)** | Handles real-valued inequalities inside logical operators and mixed continuous/integer `unsatCore`. |

---

## Key Features

- **Bundled & zero dependencies**: `pumpkin.wasm` (~1.4 MB) ships inside `@ohtaman/washi` under an MIT-compatible license.
- **Background Web Worker execution**: Runs off the main thread in browsers without `SharedArrayBuffer`, keeping UI rendering responsive.
- **Native CP constraints**: Supports `disjoint()`, `cumulative()`, `distinct()`, `allowed()`, `at()`, `max()`, `min()`, `abs()`, discrete `!=`, and `m.indicator()`.
- **Conflict diagnosis (`unsatCore`)**: `await model.check({ solver: "pumpkin" })` identifies conflicting named constraints in bounded integer and boolean models.
- **Warm starts (`initialValue`)**: Accepts starting value hints on `model.integer()` and `model.binary()` variables.

---

## Usage Examples

Import `@ohtaman/washi/solvers/pumpkin` once to register the `"pumpkin"` solver. Use `model.solve()` to optimize an integer objective over bounded integer and boolean variables, or use `model.check()` to verify satisfiability and inspect conflicting constraints.

### 1. Scheduling & Global Constraints (`model.solve()`)

```typescript
import { Model, disjoint, expr, implies, minimize, not } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const model = new Model("SchedulingStep", { solver: "pumpkin" });

const s1 = model.integer("start_job1", { lb: 0, ub: 20 });
const s2 = model.integer("start_job2", { lb: 0, ub: 20 });
const job1First = model.bool("job1_first");

model.constraint(
  disjoint([
    { start: s1, duration: 6 },
    { start: s2, duration: 4 },
  ]),
  "single_machine"
);
model.constraint(implies(job1First, expr`${s1} + 6 <= ${s2}`), "job1_before_job2");
model.constraint(implies(not(job1First), expr`${s2} + 4 <= ${s1}`), "job2_before_job1");

model.objective(minimize(expr`${s1} + ${s2}`));
await model.solve();

console.log(`Status: ${model.status}, s1=${s1.value}, s2=${s2.value}`);
// Status: Optimal, s1=4, s2=0
```

### 2. Conflict Diagnosis (`model.check()`)

```typescript
import { Model, expr, implies } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const model = new Model("PolicyConflict", { solver: "pumpkin" });
const vip = model.bool("vip");
const seats = model.integer("seats", { lb: 0, ub: 20 });

model.constraint(vip, "vip_active");
model.constraint(implies(vip, expr`${seats} >= 8`), "vip_seats");
model.constraint(expr`${seats} <= 5`, "room_cap");

const result = await model.check();
if (result.status === "Unsat") {
  console.log("Conflicting rules:", result.conflicts); // or result.unsatCore / model.unsatCore
  // ["vip_active", "vip_seats", "room_cap"]
}
```

---

## Solver Options

Pass execution options into `model.solve()`, `model.check()`, or `new PumpkinSolver(options)`. Supported options are `timeLimit` (seconds), `useWorker`, `wasmUrl`, `signal`, and `onProgress`:

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const model = new Model("TimedSearch", { solver: "pumpkin" });
const x = model.integer("x", { lb: 0, ub: 100 });
const y = model.integer("y", { lb: 0, ub: 100 });
model.constraint(expr`${x} + ${y} >= 40`, "min_total");
model.objective(minimize(expr`2 * ${x} + 3 * ${y}`));

const controller = new AbortController();

await model.solve({
  timeLimit: 30.0,
  signal: controller.signal,
  onProgress: (ev) => {
    console.log(`Elapsed: ${ev.elapsedTime.toFixed(1)}s, Best: ${ev.objectiveValue}`);
  },
});

if (model.hasPrimalSolution) {
  console.log(
    `Solution (${model.status}, termination: ${model.terminationStatus}):`,
    `obj = ${model.objectiveValue}`
  );
}
```

---

## Requirements & Limitations {#domain-api-preconditions}

Pumpkin solves **bounded integer and boolean** models only. Unsupported variables, values, or options fail fast by throwing a runtime `Error`:

- **Bounded integers only**: Every `Integer` and `Binary` variable must have finite integer bounds in $[-(2^{30} - 1),\, 2^{30} - 1]$; `Continuous` variables and infinite bounds throw an `Error`.
- **Integer coefficients & scaled bounds**: Constraint coefficients, adjusted right-hand sides (`rhs - lhs.constant`), and scaled variable bounds must be exact integers in $[-(2^{30} - 1),\, 2^{30} - 1]$.
- **Constraint magnitude sum**: In each constraint, the adjusted right-hand side magnitude plus the worst-case magnitude of every scaled variable term must not exceed $2^{31} - 2$.
- **Stricter objective bound**: Objective coefficients must be integers whose worst-case scaled term magnitudes sum to at most $2^{30} - 1$; objective constants may be fractional.
- **Unsupported model features**: `QuadExpr` objectives or constraints and `relax: true` throw a runtime `Error`.
- **Unsupported options**: `relativeGap`, `absoluteGap`, `presolve`, `threads`, `verbose`, `outputFlag`, and unknown option keys throw a runtime `Error`.

---

## Browser Worker & WASM Hosting

By default in browsers, Pumpkin loads `pumpkin.wasm` inside a dedicated Web Worker. On `file:` URLs or sandboxed iframes without an origin, it falls back to the main thread automatically.

To force main-thread execution or serve `pumpkin.wasm` from a custom URL:

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";
import { PumpkinSolver, setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";

// Set a custom WASM URL globally (or pass { wasmUrl } to solve() / check())
setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");

const model = new Model({ solver: "pumpkin" });
const x = model.integer("x", { lb: 0, ub: 10 });
model.objective(minimize(expr`${x}`));

// Option 1: Force main-thread execution for a single call
await model.solve({ useWorker: false });

// Option 2: Configure defaults on a PumpkinSolver instance
const syncModel = new Model({ solver: new PumpkinSolver({ useWorker: false }) });
```

If `pumpkin.wasm` fails to load or returns an HTML fallback page, WaSHI throws an error with the attempted URL instead of silently falling back to a CDN.

---

## References

- [Constraint Programming (CP) Modeling](../guide/constraint-programming.md) · [Resource-Constrained Project Scheduling (RCPSP)](../examples/project-scheduling.md)
- [ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin) · [`CONTRIBUTING.md` (rebuilding WASM)](https://github.com/ohtaman/washi/blob/main/CONTRIBUTING.md#4-rebuilding-webassembly-assets--release-workflow)
