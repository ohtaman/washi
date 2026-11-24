# Pumpkin Constraint Programming Solver

**Pumpkin** is an open-source constraint programming (CP) solver written in Rust ([ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin)). WaSHI bundles Pumpkin (`v0.5.0`) as WebAssembly in `@ohtaman/washi/solvers/pumpkin` with no extra packages required.

Because Pumpkin runs in a single thread, it works in browsers **without `COOP` / `COEP` HTTP headers**.

---

## Key Features

- **Bundled & zero dependencies**: `pumpkin.wasm` (~1.4 MB) ships inside `@ohtaman/washi` with an MIT-compatible license.
- **Runs in a Web Worker**: Keeps browser UI responsive and works in standard static hosting and iframes without `SharedArrayBuffer`.
- **Native CP constraints**: Supports `disjoint()`, `cumulative()`, `distinct()`, `allowed()` / `not(allowed())`, `at()`, `max()`, `min()`, `abs()`, discrete `!=`, and `m.indicator()`.
- **Conflict diagnosis (`unsatCore`)**: `await model.check({ solver: "pumpkin" })` finds conflicting named constraints in bounded integer and boolean models.
- **Warm starts (`initialValue`)**: Accepts starting value hints on `m.integer()` and `m.binary()` variables.

> [!TIP]
> Use **Pumpkin** for scheduling, resource limits, all-different assignments, and browser `unsatCore` without `COOP`/`COEP`. Use **HiGHS** for continuous LP/MIP/QP, and **Z3** when you need `Continuous` variables in logical rules.

---

## Examples

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

## Solver Options (`timeLimit`, `signal`, `onProgress`)

Pass execution options to `model.solve()` or `model.check()`. Pumpkin supports progress callbacks and cancellation via `AbortSignal`:

```typescript
const controller = new AbortController();

await model.solve({
  timeLimit: 30.0, // Maximum solve time in seconds
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

Pumpkin only solves **bounded integer and boolean** models and throws an explicit error for unsupported inputs:

- **Bounded integers only**: Every `Integer` or `Binary` variable must have finite bounds within $[-(2^{30} - 1),\, 2^{30} - 1]$. `Continuous` variables and `-Infinity` / `Infinity` bounds are rejected.
- **Integer coefficients and bounds**: Constraint coefficients, adjusted right-hand sides (`rhs - lhs.constant`), and scaled variable bounds must be exact integers within signed 32-bit safe range (`|rhs| + sum_i max(|c_i * lb_i|, |c_i * ub_i|) <= 2^31 - 2`). Objective constants may be fractional.
- **Unsupported features**: `QuadExpr` objectives/constraints, `relax: true`, and LP tolerances (`relativeGap`, `absoluteGap`, `presolve`) are not used because Pumpkin is an exact integer CP solver.

---

## Browser Worker & WASM Hosting

By default in browsers, Pumpkin loads the bundled `pumpkin.wasm` inside a dedicated Web Worker (falling back to the main thread on `file:` URLs or sandboxed iframes). To run on the main thread or serve `pumpkin.wasm` from a custom URL:

```typescript
import { Model } from "@ohtaman/washi";
import { PumpkinSolver, setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";

// Run on the main thread per call or per solver instance
await model.solve({ useWorker: false });
const syncModel = new Model({ solver: new PumpkinSolver({ useWorker: false }) });

// Custom WASM URL (or pass { wasmUrl } to solve/check)
setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");
```

If `pumpkin.wasm` fails to load or returns an HTML fallback page, WaSHI throws an error with the attempted URL instead of silently falling back to a CDN.

---

## References

- [Constraint Programming (CP) Modeling](../guide/constraint-programming.md) · [Resource-Constrained Project Scheduling (RCPSP)](../examples/project-scheduling.md)
- [ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin) · [`CONTRIBUTING.md` (rebuilding WASM)](https://github.com/ohtaman/washi/blob/main/CONTRIBUTING.md#4-rebuilding-webassembly-assets--release-workflow)
