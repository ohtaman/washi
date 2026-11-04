# HiGHS Solver Engine

**HiGHS** is high-performance mathematical optimization software developed at the University of Edinburgh ([ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS)). It is widely recognized as the state-of-the-art open-source solver for Linear Programming (LP), Mixed-Integer Programming (MIP), and Convex Quadratic Programming (QP).

In `@ohtaman/washi`, HiGHS runs entirely in WebAssembly via the open-source [`highs`](https://www.npmjs.com/package/highs) package ([lovasoa/highs-js](https://github.com/lovasoa/highs-js) by Ophir Lojkine), providing zero-config execution across Node.js, Web Workers, and browsers.

---

## Key Features in WaSHI

- **Built-in & Zero-Config**: Bundled directly with `@ohtaman/washi` using the upstream [`highs`](https://www.npmjs.com/package/highs) WASM distribution. No separate peer dependency or C++ compiler required.
- **Permissive MIT License**: 100% commercially friendly.
- **Web Worker Multithreading**: Automatically offloads intensive solving to background Web Workers in browser environments to avoid freezing the UI thread.
- **Warm-Start Support (`initialValue`)**: Supports passing variable primal initial value hints (`initialValue`) to HiGHS `setSolution` for warm starting.
- **Fast WASM Execution**: Runs the upstream 32-bit WebAssembly binary at near-native speed.

---

## Architecture & WebAssembly Runtime

WaSHI does not compile HiGHS from C++ source in-tree. Instead, it packages and bundles the WebAssembly binary (`highs.wasm`) and runtime provided by the upstream [`highs`](https://www.npmjs.com/package/highs) npm package ([lovasoa/highs-js](https://github.com/lovasoa/highs-js)), wrapping it with WaSHI's algebraic modeling layer, automatic Web Worker offloading, and standard solver abstractions.

### Callbacks & Solver Interactivity

- **Progress Monitoring & Cancellation (Supported)**:
  Through HiGHS's internal logging and interrupt hooks, WaSHI provides real-time progress callbacks (`onProgress`) and cooperative mid-solve cancellation via standard `AbortSignal`.
- **Dynamic Cuts / Lazy Constraints (Not Supported in WASM Wrapper)**:
  The upstream WebAssembly wrapper intentionally excludes low-level native callback type 8 (`MIP lazy constraints`) due to WASM-to-JS boundary and synchronous memory safety constraints. For problems requiring subtour elimination or Benders decomposition, use an **iterative cutting-plane loop** (solve $\to$ detect violation $\to$ `model.constraint(...)` $\to$ re-solve).

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
Solves quadratic objective functions subject to linear constraints:

```typescript
// Minimize risk/variance uniformly using expr:
model.objective(minimize(expr`0.5 * ${x}^2 + 0.5 * ${y}^2`));

// Or programmatically with .mul():
// const quadObj = x.mul(x).mul(0.5).add(y.mul(y).mul(0.5));
// model.objective(minimize(quadObj));
```

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

