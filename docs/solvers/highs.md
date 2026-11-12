# HiGHS Solver Engine

**HiGHS** is high-performance mathematical optimization software initiated at the University of Edinburgh ([highs.dev](https://highs.dev/) · [ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS)). It is widely recognized as the state-of-the-art open-source solver for Linear Programming (LP), Mixed-Integer Programming (MIP), and Convex Quadratic Programming (QP).

In `@ohtaman/washi`, HiGHS runs entirely in WebAssembly compiled directly from official upstream source ([ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS)) using its native C API (`highs_c_api.h`), providing zero-config execution across Node.js, Web Workers, and browsers without third-party wrapper dependencies.

---

## Key Features in WaSHI

- **Built-in & Zero-Config**: Bundled directly with `@ohtaman/washi` with zero external runtime dependencies. No separate peer dependency or C++ compiler required.
- **Permissive MIT License**: 100% commercially friendly.
- **Background Web Worker Execution**: Automatically offloads solving to a dedicated Web Worker in browser environments to avoid freezing the UI thread.
- **Warm-Start Support (`initialValue`)**: Supports passing variable primal initial value hints (`initialValue`) to HiGHS `setSolution` for warm starting.
- **Fast WASM Execution**: Runs the directly compiled 32-bit WebAssembly binary at near-native speed.

---

## Architecture & WebAssembly Runtime

WaSHI compiles official HiGHS C++ source directly to WebAssembly (`highs.wasm`) with `-fwasm-exceptions` and single-threaded universal portability (`-DHIGHS_NO_DEFAULT_THREADS=ON`). By interfacing directly with HiGHS's native C API (`highs_c_api.h`), WaSHI achieves zero-copy solution extraction via typed array views on WebAssembly linear memory, rapid upstream release tracking, and a self-contained zero-dependency distribution.

### Callbacks & Solver Interactivity

- **Progress Monitoring & Cancellation (Supported)**:
  Through HiGHS's internal logging and interrupt hooks, WaSHI provides real-time progress callbacks (`onProgress`) and cooperative mid-solve cancellation via standard `AbortSignal`.
- **Dynamic Cuts / Lazy Constraints (Not Exposed in WASM Driver)**:
  WaSHI's HiGHS WebAssembly C API driver currently binds logging, progress, interrupt, and incumbent callbacks and does not expose in-tree lazy constraint or user cut callbacks across the WASM-to-JS boundary. For problems requiring dynamic subtour elimination or Benders decomposition, use [`await m.solveBenders({ subproblem })`](../guide/decomposition.md#benders-decomposition-solvebenders) (or a manual outer cutting-plane loop: solve $\to$ detect violation $\to$ `model.constraint(...)` $\to$ re-solve), which iteratively separates cuts and converges to the same exact optimal solution.

### WebAssembly Asset Lifecycle & On-Demand Builds

HiGHS's WebAssembly binary (`public/highs.wasm`) and runtime driver (`runtime.js`) are managed via `highs.config.json` with cryptographic SHA-256 verification:
- **Zero-Friction Verification**: Build and distribution pipelines run `node scripts/ensure-highs-wasm.mjs`, verifying local assets in milliseconds before bundling.
- **On-Demand Release Download**: When assets are missing or updated, `ensure-highs-wasm.mjs` automatically downloads verified binaries from WaSHI's GitHub Release assets.
- **Compiling from Source**: When updating HiGHS or modifying compiler flags, run `npm run build:highs-wasm` with the Emscripten SDK (`emcc`), CMake, and Ninja installed, and upload the rebuilt assets to the `highs-<version>` GitHub Release tag (`gh release upload highs-v1.15.1 public/highs.wasm src/modeler/solvers/highs/runtime.js --clobber`) so on-demand downloads match `highs.config.json` (or run `.github/workflows/build-wasm.yml` and commit the `highs-wasm-assets` artifact including `highs.config.json`).

---

## Supported Problem Classes

### 1. Linear Programming (LP)
Solves continuous problems via Primal and Dual Simplex algorithms or Interior Point (IPM) methods. After solving, you can inspect constraint shadow prices (`c.dual`), slacks (`c.slack`), and variable reduced costs (`v.reducedCost`):

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const model = new Model({ solver: "highs" });
const x = model.continuous("x", { lb: 0 });
const y = model.continuous("y", { lb: 0 });
model.objective(maximize(expr`10 * ${x} + 6 * ${y}`));
model.constraint(expr`${x} + ${y} <= 100`, "cap");
await model.solve();
```

### 2. Mixed-Integer Linear Programming (MIP)
Solves discrete problems using Branch-and-Bound and cutting plane techniques:

```typescript
const count = model.integer("count", { lb: 0, ub: 50 });
```

### 3. Convex Quadratic Programming (QP)
Solves continuous models with convex quadratic objective functions subject to linear constraints:

```typescript
// Minimize risk/variance uniformly using expr:
model.objective(minimize(expr`0.5 * ${x}^2 + 0.5 * ${y}^2`));

// Or programmatically with .mul():
// const quadObj = x.mul(x).mul(0.5).add(y.mul(y).mul(0.5));
// model.objective(minimize(quadObj));
```

> [!NOTE]
> **Continuous Convex QP Only**: HiGHS solves Convex QP models where **all** model variables are continuous (`m.continuous`), with a positive semi-definite quadratic matrix $\mathbf{Q}$ when minimizing (or negative semi-definite when maximizing). Mixed-Integer Quadratic Programming (**MIQP**—any model combining a quadratic objective with `Integer`, `Binary`, or `BoolVar` variables) and quadratic constraints (**QCP**) are not supported; to model products of binary decisions in MILP, see [Formulation Patterns & Tips](../guide/formulation-tips.md).

---

## Solver Options

Pass solver options into `model.solve()`:

```typescript
const controller = new AbortController();

await model.solve({
  timeLimit: 60.0,       // Maximum solve time in seconds
  mipGap: 0.001,         // Terminate when within 0.1% of global optimality (alias: relGap)
  absGap: 1.0,           // Absolute MIP optimality gap tolerance
  presolve: "on",        // Presolve control ("on" | "off" | "choose")
  outputFlag: true,      // Output internal simplex / branch-and-bound logs (output_flag)
  signal: controller.signal,
  onProgress: (ev) => {
    console.log(`Elapsed: ${ev.elapsedTime.toFixed(1)}s, Best: ${ev.objectiveValue}`);
  },
});

// Always check hasPrimalSolution when timeLimit or AbortSignal is used:
if (model.hasPrimalSolution) {
  console.log(
    `Usable solution (${model.status}, termination: ${model.terminationStatus}):`,
    `obj = ${model.objectiveValue}, gap = ${((model.relGap ?? 0) * 100).toFixed(2)}%`
  );
}
```

---

## Worker & WASM Configuration in Browsers

By default in browsers, WaSHI spawns a dedicated Web Worker to execute HiGHS in the background so UI rendering stays responsive and `onProgress` / `AbortSignal` work seamlessly.

If you need to run synchronously on the main thread (or in environments where Web Workers are prohibited), pass `useWorker: false` to `model.solve()` or instantiate `HighsSolver`:

```typescript
import { Model, HighsSolver } from "@ohtaman/washi";

// Option 1: Per solve call
await model.solve({ useWorker: false });

// Option 2: When instantiating the solver
const syncModel = new Model({
  solver: new HighsSolver({ useWorker: false }),
});
```

---

## References & Upstream Links

- **Official Website**: [https://highs.dev/](https://highs.dev/)
- **Official Documentation**: [https://ergo-code.github.io/HiGHS/](https://ergo-code.github.io/HiGHS/)
- **Source Repository**: [ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS) (MIT License)
- **Academic Citation**: If you cite HiGHS in academic or technical publications, please reference the foundational paper requested by the HiGHS authors:
  > Q. Huangfu and J. A. J. Hall, *"Parallelizing the dual revised simplex method"*, Mathematical Programming Computation, 10 (1), 119–142, 2018. DOI: [10.1007/s12532-017-0130-5](https://doi.org/10.1007/s12532-017-0130-5)

