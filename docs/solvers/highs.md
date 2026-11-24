# HiGHS Solver Engine

**HiGHS** is an open-source mathematical optimization solver started at the University of Edinburgh ([highs.dev](https://highs.dev/) · [ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS)). It solves Linear Programming (LP), Mixed-Integer Programming (MIP), and convex Quadratic Programming (QP) problems.

In `@ohtaman/washi`, HiGHS is the built-in default solver. It ships as a bundled WebAssembly binary with zero external dependencies and runs in Node.js, browsers, and Web Workers.

---

## When to Choose HiGHS

| Problem Type | Recommended Solver | Why |
| :--- | :--- | :--- |
| **LP, MIP, or continuous convex QP** | **HiGHS** (default) | Bundled under MIT, fast numerical solving, LP duals and slacks, and MIP warm starts. |
| **Bounded-integer Constraint Programming (CP)** | **[Pumpkin](./pumpkin.md)** | Native `disjoint`, `cumulative`, `distinct`, and `unsatCore` without Cross-Origin Isolation headers. |
| **Logical rules with `Continuous` variables** | **[Z3](./z3.md)** | Exact arithmetic inside logical operators and mixed continuous/integer `unsatCore`. |
| **GNU GLPK compatibility or benchmarking** | **[GLPK](./glpk.md)** | Optional GPL-3.0 peer dependency for cross-checking legacy GLPK models. |

> [!TIP]
> Start with **HiGHS** for almost all numerical optimization models. Switch to **Pumpkin** or **Z3** when you need native CP propagation or Satisfiability Modulo Theories (SMT) conflict diagnosis.

---

## Key Features in WaSHI

- **Built-in & zero-config**: Bundled directly inside `@ohtaman/washi` under the MIT license with no extra packages to install.
- **No `COOP`/`COEP` headers needed**: Runs single-threaded WebAssembly without `SharedArrayBuffer` or [Cross-Origin Isolation](../getting-started/cross-origin.md) headers.
- **Background Web Worker execution**: Offloads solving to a dedicated Web Worker in browsers by default so UI rendering stays responsive.
- **Warm-start hints (`initialValue`)**: Accepts starting variable values on `model.continuous()`, `model.integer()`, and `model.binary()` variables.
- **LP relaxation (`relax: true`)**: Solves the continuous relaxation of a MIP model without rewriting variable declarations.

---

## Supported Problem Classes

HiGHS uses a single `Model` interface across continuous, discrete, and quadratic problems. Choose the variable types and objective form that match your problem class.

### 1. Linear Programming (LP)

LP models use continuous variables, linear constraints, and a linear objective. HiGHS solves them with simplex or interior-point methods, populating `c.dual` shadow prices, `c.slack` slacks, and `v.reducedCost` reduced costs:

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const model = new Model({ solver: "highs" });
const x = model.continuous("x", { lb: 0 });
const y = model.continuous("y", { lb: 0 });

model.objective(maximize(expr`10 * ${x} + 6 * ${y}`));
const cap = model.constraint(expr`${x} + ${y} <= 100`, "cap");

await model.solve();
console.log(model.status, model.objectiveValue, cap.dual, cap.slack);
```

### 2. Mixed-Integer Programming (MIP)

MIP models combine continuous variables with `model.integer()` or `model.binary()` variables. HiGHS solves them via branch-and-cut and reports `objectiveBound`, `relativeGap`, and `absoluteGap`:

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const mipModel = new Model({ solver: "highs" });
const count = mipModel.integer("count", { lb: 0, ub: 50 });
const open = mipModel.binary("open");

mipModel.objective(maximize(expr`12 * ${count} - 100 * ${open}`));
mipModel.constraint(expr`${count} <= 50 * ${open}`, "link");

await mipModel.solve();
console.log(mipModel.status, count.value, open.value);
```

### 3. Convex Quadratic Programming (QP)

QP models optimize a convex quadratic objective (or concave when maximizing) over continuous variables subject to linear constraints:

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const qpModel = new Model({ solver: "highs" });
const x = qpModel.continuous("x", { lb: 0 });
const y = qpModel.continuous("y", { lb: 0 });

qpModel.constraint(expr`${x} + ${y} >= 10`, "demand");
qpModel.objective(minimize(expr`0.5 * ${x}^2 + 0.5 * ${y}^2`));

await qpModel.solve();
console.log(qpModel.status, qpModel.objectiveValue, x.value, y.value);
// Optimal 25 5 5
```

> [!NOTE]
> **Continuous convex QP only**: Every variable in a QP model must be continuous (`model.continuous()`). When minimizing, the quadratic matrix $\mathbf{Q}$ must be positive semi-definite; when maximizing, it must be negative semi-definite.
>
> Mixed-Integer Quadratic Programming and quadratic constraints are not supported. To linearize products of binary variables as a MIP, see [Formulation Patterns & Tips](../guide/formulation-tips.md).

---

## Solver Options

Pass execution options into `model.solve()` or the `HighsSolver` constructor. HiGHS validates option keys strictly and throws an `Error` on unsupported keys so misconfigurations fail early.

### Supported Options

| Option | Type | Description |
| :--- | :--- | :--- |
| `timeLimit` | `number` | Maximum solve time in seconds. |
| `relativeGap` | `number` | Stop when the relative MIP optimality gap falls within this tolerance. |
| `absoluteGap` | `number` | Stop when the absolute MIP optimality gap falls within this tolerance. |
| `presolve` | `"on" \| "off" \| "choose"` | Controls model presolve before optimization. |
| `outputFlag` | `boolean` | Enables internal simplex and branch-and-cut logs (`false` by default). |
| `relax` | `boolean` | Solves the continuous LP relaxation of a MIP model. |
| `useWorker` | `boolean` | Runs HiGHS in a browser Web Worker (`true` by default in browsers). |
| `wasmUrl` | `string \| null` | Overrides the `highs.wasm` asset URL for this solve. |
| `signal` | `AbortSignal` | Cooperatively cancels an in-flight solve. |
| `onProgress` | `(ev) => void` | Receives live elapsed time, primal objective, dual bound, and gap updates. |

HiGHS also accepts these passthrough limit keys: `mip_max_nodes`, `mip_max_improving_sols`, `mip_max_leaves`, `simplex_iteration_limit`, and `ipm_iteration_limit`.

### Unsupported Options (Throw at Runtime)

- `verbose`: Throws an `Error`. Use `outputFlag: true` instead.
- `threads`: Throws an `Error` because HiGHS WebAssembly runs single-threaded.
- Unknown option keys: Any unrecognized key throws an `Error`.

### Example with Time Limit, Progress, and Cancellation

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const model = new Model({ solver: "highs" });
const x = model.integer("x", { lb: 0, ub: 100 });
const y = model.integer("y", { lb: 0, ub: 100 });
model.objective(maximize(expr`10 * ${x} + 6 * ${y}`));
model.constraint(expr`${x} + ${y} <= 100`, "cap");

const controller = new AbortController();

await model.solve({
  timeLimit: 60.0,
  relativeGap: 0.001,
  absoluteGap: 1.0,
  presolve: "on",
  outputFlag: true,
  signal: controller.signal,
  onProgress: (ev) => {
    console.log(`Elapsed: ${ev.elapsedTime.toFixed(1)}s, Best: ${ev.objectiveValue}`);
  },
});

if (model.hasPrimalSolution) {
  console.log(
    `Solution (${model.status}, termination: ${model.terminationStatus}):`,
    `obj = ${model.objectiveValue}, gap = ${((model.relativeGap ?? 0) * 100).toFixed(2)}%`
  );
}
```

---

## Web Worker & WASM Configuration in Browsers

In browsers, WaSHI runs HiGHS inside a dedicated Web Worker by default. This keeps UI rendering responsive and allows `onProgress` and `AbortSignal` to interrupt long solves cleanly.

To run on the main thread (for example, in environments that restrict Web Workers) or serve `highs.wasm` from a custom path, configure `useWorker`, `setHighsWasmUrl`, or `wasmUrl`:

```typescript
import { Model, HighsSolver, expr, maximize, setHighsWasmUrl } from "@ohtaman/washi";

// Configure a custom WASM URL globally (pass null to restore the bundled asset)
setHighsWasmUrl("/assets/wasm/highs.wasm");

const model = new Model({ solver: "highs" });
const x = model.continuous("x", { lb: 0, ub: 10 });
model.objective(maximize(expr`${x}`));

// Option 1: Disable the Web Worker or override wasmUrl per solve call
await model.solve({ useWorker: false, wasmUrl: "/assets/wasm/highs.wasm" });

// Option 2: Configure defaults on a HighsSolver instance
const syncModel = new Model({
  solver: new HighsSolver({ useWorker: false }),
});
```

If `highs.wasm` fails to load or returns an HTML error page, WaSHI throws an error with the attempted URL instead of silently falling back to an external CDN.

---

## Architecture & WebAssembly Runtime

> [!NOTE]
> This optional section covers internal WebAssembly packaging details for maintainers and advanced integrators.

WaSHI compiles official HiGHS C++ sources directly to 32-bit WebAssembly (`highs.wasm`) with `-fwasm-exceptions` and `-DHIGHS_NO_DEFAULT_THREADS=ON`. The driver calls HiGHS's native C API (`highs_c_api.h`) directly, using typed-array views over linear memory for zero-copy solution extraction and `setSolution` for MIP warm starts.

Bundled `highs.wasm` and `runtime.js` artifacts are verified against SHA-256 checksums in `highs.config.json`. Maintainers rebuilding HiGHS from source can follow [`CONTRIBUTING.md`](https://github.com/ohtaman/washi/blob/main/CONTRIBUTING.md#4-rebuilding-webassembly-assets--release-workflow).

### Callbacks & Solver Interactivity

- **Progress & cancellation**: Supported through HiGHS's logging and interrupt callbacks (`onProgress` and `AbortSignal`).
- **Dynamic cuts & lazy constraints**: Not exposed inside the branch-and-bound tree across the WASM boundary. For subtour elimination or Benders decomposition, use [`await m.solveBenders({ subproblem })`](../guide/decomposition.md#benders-decomposition-solvebenders) or an outer cutting-plane loop.

---

## References & Upstream Links

- **Official Website**: [https://highs.dev/](https://highs.dev/)
- **Official Documentation**: [https://ergo-code.github.io/HiGHS/](https://ergo-code.github.io/HiGHS/)
- **Source Repository**: [ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS) (MIT License)
- **Academic Citation**: Please cite the foundational HiGHS paper when referencing HiGHS in publications:
  > Q. Huangfu and J. A. J. Hall, *"Parallelizing the dual revised simplex method"*, Mathematical Programming Computation, 10 (1), 119–142, 2018. DOI: [10.1007/s12532-017-0130-5](https://doi.org/10.1007/s12532-017-0130-5)
