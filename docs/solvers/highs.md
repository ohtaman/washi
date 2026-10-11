# HiGHS Solver Engine

**HiGHS** is high-performance mathematical optimization software developed at the University of Edinburgh. It is widely recognized as the state-of-the-art open-source solver for Linear Programming (LP), Mixed-Integer Programming (MIP), and Convex Quadratic Programming (QP).

---

## Key Features in WaSHI

- **Built-in & Zero-Config**: Bundled directly with `@ohtaman/washi`. No separate peer dependency or compilation required.
- **Permissive MIT License**: 100% commercially friendly.
- **Web Worker Multithreading**: Automatically offloads intensive solving to background Web Workers in browser environments to avoid freezing the UI thread.
- **Fast WASM Execution**: Emscripten-compiled 32-bit WASM runs at near-native speed.

---

## Supported Problem Classes

### 1. Linear Programming (LP)
Solves continuous problems via Primal and Dual Simplex algorithms or Interior Point (IPM) methods:

```typescript
const model = new Model({ solver: "highs" });
const x = model.addVar({ lb: 0 });
const y = model.addVar({ lb: 0 });
model.maximize(expr`10 * ${x} + 6 * ${y}`);
model.addConstraint(c`${x} + ${y} <= 100`);
await model.solve();
```

### 2. Mixed-Integer Linear Programming (MIP)
Solves discrete problems using Branch-and-Bound and cutting plane techniques:

```typescript
const count = model.addVar({ type: "Integer", lb: 0, ub: 50 });
```

### 3. Convex Quadratic Programming (QP)
Solves quadratic objective functions subject to linear constraints:

```typescript
// Minimize risk/variance: 0.5 * x^2 + 0.5 * y^2
model.minimize(expr`0.5 * ${x} * ${x} + 0.5 * ${y} * ${y}`);
```

---

## Solver Options

Pass solver options into `model.solve()`:

```typescript
await model.solve({
  timeLimit: 60.0,       // Maximum solve time in seconds
  mipGap: 0.001,         // Terminate when within 0.1% of global optimality
  verbose: true,         // Output internal simplex / branch-and-bound logs
});
```

---

## Worker Configuration in Browsers

By default in browsers, WaSHI spawns a dedicated Web Worker to execute HiGHS in the background.

If you need to run synchronously on the main thread (or in environments where Web Workers are prohibited):

```typescript
const model = new Model({
  solver: "highs",
  solverOptions: {
    useWorker: false,
  },
});
```
