# Pumpkin Constraint Programming Solver

**Pumpkin** is a Lazy Clause Generation (LCG) constraint programming solver developed in pure Rust by ConSol Lab at TU Delft ([ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin) · [docs.rs/pumpkin-core](https://docs.rs/pumpkin-core)). WaSHI compiles Pumpkin (`v0.5.0`) directly to WebAssembly and bundles it in `@ohtaman/washi/solvers/pumpkin` with zero external runtime dependencies.

Unlike multi-threaded WASM engines, Pumpkin runs as a single-threaded WebAssembly instance inside a Web Worker (or directly in Node.js) and **does not require Cross-Origin Isolation (`COOP` / `COEP`) headers** in browsers.

---

## Key Features in WaSHI

- **Bundled & Zero External Dependencies**: `pumpkin.wasm` (`~1.4 MB`) is shipped directly with `@ohtaman/washi` and tree-shaken into `@ohtaman/washi/solvers/pumpkin`—no separate `npm install` peer dependency or Rust toolchain required.
- **Permissive MIT License**: 100% commercially friendly, including all transitive Rust WASM dependencies (`MIT`, `Apache-2.0`, `Unicode-3.0`).
- **Background Web Worker & Zero `COOP` / `COEP`**: Runs in a dedicated Web Worker on HTTP(S) origins without `SharedArrayBuffer` or Cross-Origin Isolation headers, keeping UI rendering responsive while working in standard static hosts and third-party iframes.
- **Native CP Global Constraints & Propagators**: Lowers `distinct()` (`all_different` via pairwise `binary_not_equals` in Pumpkin `v0.5.0`), `disjoint()` (`disjunctive_strict` Vilím edge-finding), `cumulative()` (time-table filtering), `allowed()` / `not(allowed())` (`table` / `negative_table`), `at()` (`element`), `max()` / `min()` / `abs()` (`maximum` / `minimum` / `absolute`), discrete `!=` (`not_equals`), and `m.indicator()` (with `M` omitted, via `implied_by`) directly to Pumpkin constraints.
- **Zero-`COOP` / `COEP` Unsat Core Diagnosis**: `await model.check({ solver: "pumpkin" })` extracts conflicting named rules (`unsatCore` / `conflicts`) over bounded integer and boolean constraints in standard browser contexts.
- **Warm-Start Support (`initialValue`)**: Supports non-binding primal initial value hints (`initialValue`, `supportsWarmStart: true`) on bounded `Integer` and `Binary` variables in both `solve()` and `check()` via Pumpkin's `WarmStart` brancher (kept distinct from solved `Var.value`).

---

## Supported Problem Classes

> [!TIP]
> **HiGHS vs. Pumpkin vs. Z3**:
> - Use **HiGHS** (`{ solver: "highs" }`) for Continuous LPs, Convex QPs, or large linear-relaxation-dominated MILPs.
> - Use **Pumpkin** (`{ solver: "pumpkin" }`) for disjunctive scheduling, CP global constraints, bounded integer + propositional logic models, and zero-`COOP`/`COEP` `unsatCore` extraction.
> - Use **Z3** (`{ solver: "z3" }`) when you need continuous variables inside `implies(...)` / `not(...)` or arbitrary real-valued SMT arithmetic.

### 1. Disjunctive Scheduling & Global CP Constraints (`model.solve()`)

Model unary/cumulative resource scheduling, precedence logic (`implies`, `not`), and global predicates (`disjoint`, `distinct`, `cumulative`, `allowed`, `at`, `max`, `min`, `abs`) directly over bounded integers:

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
```

### 2. Satisfiability & Unsat Core Diagnosis (`model.check()`)

Call `await model.check()` to verify satisfiability over integer linear constraints, CP global constraints, and nested propositional logic (`and`, `or`, `not`, `implies`, `xor`), and isolate conflicting named rules (`conflicts` / `unsatCore`) when unsatisfiable:

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
  console.log("Conflicting rules:", result.conflicts); // also on result.unsatCore / model.unsatCore
}
```

---

## Solver Options

Pass solver options into `model.solve()` or `model.check()`:

```typescript
const controller = new AbortController();

await model.solve({
  timeLimit: 30.0,       // Maximum solve time in seconds
  signal: controller.signal,
  onProgress: (ev) => {
    console.log(`Elapsed: ${ev.elapsedTime.toFixed(1)}s, Best: ${ev.objectiveValue}`);
  },
});

// Always check hasPrimalSolution when timeLimit or AbortSignal is used:
if (model.hasPrimalSolution) {
  console.log(
    `Usable solution (${model.status}, termination: ${model.terminationStatus}):`,
    `obj = ${model.objectiveValue}`
  );
}
```

---

## Domain & API Preconditions

Pumpkin is strictly a **bounded integer & boolean CP/LCG solver**. Unsupported constructs are rejected with explicit errors rather than silent rounding or fallbacks:

- **Bounded integer / binary / boolean variables only**: All `Var` instances must be finite integers (`Integer` or `Binary`) with `lb` and `ub` within `[-(2^30 - 1), 2^30 - 1]`. Unbounded integers (`-Infinity` / `Infinity`) and `Continuous` variables throw an explicit error.
- **Integer linear arithmetic**: Constraint coefficients, adjusted RHS values (`rhs - lhs.constant`), and scaled variable bounds must be exact integers within safe signed 32-bit range (`|rhs| + sum_i max(|c_i * lb_i|, |c_i * ub_i|) <= 2^31 - 2`). Objective constants (`f64`) may be fractional.
- **Unsupported features**: `QuadExpr` objectives/constraints, `Continuous` variables, unbounded variables, and `relax: true` throw explicit errors.

---

## Worker & WASM Configuration in Browsers

By default in browsers, `@ohtaman/washi/solvers/pumpkin` resolves the bundled `pumpkin.wasm` and spawns `pumpkin-worker.js` in a dedicated Web Worker on HTTP(S) origins (falling back to main-thread execution on `file:` URLs or opaque-origin sandboxed iframes).

To execute synchronously on the main thread (or in environments where Web Workers are prohibited), pass `useWorker: false` to `model.solve()` / `model.check()` or instantiate `PumpkinSolver`:

```typescript
import { Model } from "@ohtaman/washi";
import { PumpkinSolver, setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";

// Option 1: Per solve / check call
await model.solve({ useWorker: false });

// Option 2: When instantiating the solver
const syncModel = new Model({
  solver: new PumpkinSolver({ useWorker: false }),
});

// Host pumpkin.wasm at a custom path or CDN (globally or per call via { wasmUrl }):
setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");
```

If `pumpkin.wasm` cannot be loaded or returns an HTML SPA fallback instead of a WebAssembly binary, Pumpkin rejects explicitly with the attempted URL and performs **no silent CDN fallback**.

---

## Architecture & WebAssembly Runtime

WaSHI compiles its Rust WebAssembly wrapper (`wasm/pumpkin`, linking `pumpkin-core`, `pumpkin-constraints`, `pumpkin-propagators`, and `pumpkin-conflict-resolvers` `v0.5.0` to `wasm32-unknown-unknown`) directly to `pumpkin.wasm` with `wasm-bindgen` bindings.

Bundled `pumpkin.wasm` and `runtime.js` / `runtime.d.ts` artifacts are tracked and verified via SHA-256 checksums in `pumpkin.config.json`. Maintainers rebuilding Pumpkin from source can follow the instructions in [`CONTRIBUTING.md`](https://github.com/ohtaman/washi/blob/main/CONTRIBUTING.md#4-rebuilding-webassembly-assets--release-workflow).

### Callbacks & Solver Interactivity

- **Progress Monitoring & Cancellation (Supported)**:
  During `solve()`, Pumpkin emits real-time incumbent progress callbacks (`onProgress`, providing `elapsedTime` and `objectiveValue`) and honors `AbortSignal`: browser Web Worker execution supports preemptive mid-solve Worker termination and queue cancellation, while main-thread and Node.js runs poll cooperative `should_abort` checkpoints across branching and termination hooks.
- **Exact Discrete Optimality**:
  As an exact LCG solver over finite integer domains, Pumpkin proves optimality via nogood clause learning and objective-bound strengthening (`LinearSatUnsat`) rather than LP relaxation tolerances (`mipGap`, `relGap`, `absGap`, or `presolve`).

---

## References & Upstream Links

- **Modeling Guide & Walkthrough**: [Constraint Programming (CP) Modeling](../guide/constraint-programming.md) · [Resource-Constrained Project Scheduling (RCPSP)](../examples/project-scheduling.md)
- **Source Repository**: [ConSol-Lab/Pumpkin](https://github.com/ConSol-Lab/Pumpkin) (MIT License — ConSol Lab, TU Delft)
- **Rust Crate & API Docs**: [docs.rs/pumpkin-core](https://docs.rs/pumpkin-core) · [crates.io/crates/pumpkin-core](https://crates.io/crates/pumpkin-core)
