# AI Coding Agent Quick-Reference Guide

> **Scope Note**: This document is the **consumer modeling quick-reference** for AI coding agents and developers building optimization or satisfiability models with `@ohtaman/washi`. For repository contribution and pull-request review rules, see [`AGENTS.md`](https://github.com/ohtaman/washi/blob/main/AGENTS.md) in the repository root.

---

## 1. Package Imports & Deployment

### Node.js / Bundlers (Vite, Webpack, Next.js, Bun)

```ts
import {
  Model,
  expr,
  sum,
  dot,
  maximize,
  minimize,
  and,
  or,
  not,
  implies,
  xor,
  setHighsWasmUrl,
} from "@ohtaman/washi";

// Optional solver plugins (require installing peer dependencies first):
// npm install z3-solver
import "@ohtaman/washi/solvers/z3";
// npm install glpk.js
import "@ohtaman/washi/solvers/glpk";
```

### Browser ESM & Classic Script Tags

- **Browser ESM**:
  - Core (HiGHS built-in): `import { Model, expr, maximize } from "./washi/washi.js";`
  - GLPK plugin: `import "./washi/solvers/glpk.js";`
  - Z3 plugin: `import "./washi/solvers/z3.js";`
- **Classic `<script>` / CodePen (IIFE)**:
  - Core: `<script src="./washi/washi.min.js"></script>` (exposes global `Washi`)
  - GLPK plugin: `<script src="./washi/solvers/glpk.min.js"></script>` (registers `"glpk"`, exposes `WashiGLPK`)
  - Z3 plugin: `<script src="./washi/solvers/z3.min.js"></script>` (registers `"z3"`, exposes `WashiZ3`)

### WebAssembly Asset & Runtime Rules

1. **Bundled WASM by default (no implicit CDN fallback)**:
   - In Node.js and modern bundlers, WebAssembly assets resolve relative to the module automatically.
   - In browser deployments, deploy the full `dist/browser/` directory (JS, Worker, and `.wasm` files) together. If a local WASM URL is missing or returns an HTML SPA fallback, initialization fails immediately and reports the attempted URL—it **never** silently switches to a public CDN.
   - To load `highs.wasm` from a custom location, call `setHighsWasmUrl("https://.../highs.wasm")` or pass `await m.solve({ wasmUrl: "https://.../highs.wasm" })`.
2. **Z3 requires Cross-Origin Isolation in browsers**:
   - Z3 WebAssembly uses `SharedArrayBuffer` multithreading. Browser pages running Z3 must be cross-origin isolated (`window.crossOriginIsolated === true`) by serving:
     - `Cross-Origin-Opener-Policy: same-origin`
     - `Cross-Origin-Embedder-Policy: require-corp`
     - `Cross-Origin-Resource-Policy: cross-origin` (on cross-origin script/WASM assets)
   - Importing `@ohtaman/washi` never auto-injects a Service Worker. When cross-origin isolation is absent in a browser, Z3 rejects immediately with a descriptive error.
3. **Web Workers & Cancellation (`AbortSignal`)**:
   - In browsers where `Worker` is available, HiGHS runs in a dedicated Web Worker by default (`useWorker: true`). Passing `{ signal }` to `m.solve({ signal })` terminates an in-flight Worker solve immediately upon abort.
   - When `useWorker: false` (or on main-thread / synchronous solver execution in Node.js), `signal` is checked before and after native WASM execution; it cannot preempt a synchronous blocking WASM call mid-solve.

---

## 2. Canonical Modeling Workflow

Formulating and solving a model consists of four distinct steps:

### Step 1: Create Model & Decision Variables

```ts
const m = new Model("ExampleModel");

// Scalar variables
const x = m.continuous("x", { lb: 0, ub: 100 });
const n = m.integer("n", { lb: 0, ub: 10 });
const b = m.binary("b");
const flag = m.bool("flag"); // Propositional boolean (for Z3 / logical constraints)

// Indexed variable containers:
// - Numeric dimension -> Array
// - Key-array dimension -> Record
const vec = m.continuous(4, { lb: 0, prefix: "v" }); // Var[] (length 4)
const grid = m.binary(2, 3, { prefix: "g" }); // Var[][] (2x3)
const byItem = m.integer(["desk", "chair"] as const, { lb: 0 }); // Record<"desk" | "chair", Var>
const mixed = m.binary(["A", "B"] as const, 3); // Record<"A" | "B", Var[]>
```

### Step 2: Build Expressions (`expr`, `sum`, `dot`)

- **Unified `expr` template tag**:
  - Linear expression (`LinExpr`): `` expr`30 * ${x} + 50 * ${n} - 10` ``
  - Quadratic expression (`QuadExpr`): `` expr`${x}^2 + 2 * ${x} * ${n} + ${n}^2` `` (variable-by-variable products and squares are supported for convex QP objectives).
  - Linear constraint (`Constraint`): `` expr`${x} + 2 * ${n} <= 40` `` (supports `<=`, `>=`, `==`, and `=`).
- **Aggregations**:
  - `sum(iterable, mapper?)` sums an `Iterable` of `Var` / `LinExpr` / `number` (e.g., `Var[]`, `grid.flat()`, or `Object.values(record)`).
  - `dot(a, b)` computes the inner product of matching 1D/2D arrays, plain records, `Iterable`s, or `TypedArray`s.
- **Fluent methods**:
  - Arithmetic: `.add(other)`, `.sub(other)`, `.mul(other)`, `.div(scalar)`, `.neg()`
  - Comparisons (on `Var` and `LinExpr`): `.le(rhs, name?)`, `.ge(rhs, name?)`, `.eq(rhs, name?)`
  - Boolean logic (on `BoolVar`, `BoolExpr`, and `Constraint` for Z3): standalone `and(...)`, `or(...)`, `not(...)`, `implies(a, b)`, `xor(a, b)` and fluent `.and(...)`, `.or(...)`, `.not()`, `.implies(...)`, `.xor(...)`, `.iff(...)`

### Step 3: Register Objective & Constraints on the Model

Constructing an `expr` or `.le()` object does **not** attach it to the model until you pass it to `m.constraint(...)` (or `m.subjectTo(...)`) or `m.objective(...)`:

```ts
// Set objective (using maximize() / minimize() or property assignment)
m.objective(maximize(expr`30 * ${x} + 50 * ${n}`));
// Equivalent property form: m.maximize = expr`30 * ${x} + 50 * ${n}`;

// Register constraints on the model
m.constraint(expr`${x} + 2 * ${n} <= 40`, "resource_limit");
// Equivalent alias: m.subjectTo(expr`${x} + 2 * ${n} <= 40`, "resource_limit");

// Indicator constraint (MIP Big-M reformulation: b === 1 => x <= 50)
m.indicator(b, expr`${x} <= 50`, { activeValue: 1, name: "cap_when_b" });
```

### Step 4: Execute (`solve` or `check`) & Verify (`validateSolution`)

- **Optimization (`await m.solve(options?)`)**:
  - Returns `ModelStatus` (`"Optimal"`, `"Infeasible"`, `"Unbounded"`, `"TimeLimit"`, `"Error"`, `"Unknown"`).
  - Read values via `x.value`, `expr`...`.value`, `m.getValue(x)`, `m.getValues(container)`, `m.objectiveValue`, `constr.dual`, `constr.slack`, and `x.reducedCost`.
  - Call `m.validateSolution()` after solving to independently verify variable bounds, integer/binary domains, constraint residuals, and objective value (`{ valid: boolean, maxViolation: number, violations: [...] }`).
- **Satisfiability & Unsat Core (`await m.check(options?)`)**:
  - Requires a solver supporting SMT/SAT checks (`{ solver: "z3" }`).
  - Returns `CheckResult` (`{ status: "Sat" | "Unsat" | "Unknown", values, conflicts, unsatCore }`).
  - When `status === "Unsat"`, `result.conflicts` (alias `result.unsatCore`) lists the names of conflicting named constraints (a conflicting subset, not guaranteed minimal).
- **No concurrent mutation during async solve/check**:
  - Mutating variables, constraints, or the objective while `await m.solve()` or `await m.check()` is pending invalidates the in-flight execution and rejects the stale promise.

---

## 3. Executable Examples

### Example A: Mixed-Integer Linear Programming (MIP) with Indexed Containers & Solution Validation

```ts
import { Model, expr, dot, sum, maximize } from "@ohtaman/washi";

export async function runMipExample() {
  const m = new Model("ProductionMIP");
  const products = ["desk", "chair"] as const;
  const profit = { desk: 30, chair: 50 };
  const woodPerUnit = { desk: 1, chair: 2 };
  const laborPerUnit = { desk: 2, chair: 1 };

  const qty = m.integer(products, { lb: 0, ub: 100 });
  const setup = m.binary("setup");

  m.objective(maximize(expr`${dot(profit, qty)} - 20 * ${setup}`));
  m.constraint(expr`${dot(woodPerUnit, qty)} <= 40`, "wood_cap");
  m.constraint(expr`${dot(laborPerUnit, qty)} <= 50`, "labor_cap");
  m.constraint(expr`${sum(Object.values(qty))} <= 30 * ${setup}`, "require_setup");

  const status = await m.solve();
  const report = m.validateSolution();
  const values = m.getValues(qty);

  return {
    status,
    objectiveValue: m.objectiveValue,
    values,
    setup: setup.value,
    valid: report.valid,
    maxViolation: report.maxViolation,
  };
}
```

### Example B: Convex Quadratic Programming (QP)

Variable-by-variable products (`${x} * ${y}`) and squares (`${x}^2`) are supported in `expr` for quadratic objectives:

```ts
import { Model, expr, minimize } from "@ohtaman/washi";

export async function runQpExample() {
  const m = new Model("PortfolioQP");
  const x = m.continuous("x", { lb: 0 });
  const y = m.continuous("y", { lb: 0 });

  // Minimize x^2 + y^2 subject to x + y >= 4
  m.objective(minimize(expr`${x}^2 + ${y}^2`));
  m.constraint(expr`${x} + ${y} >= 4`, "budget");

  const status = await m.solve();
  const report = m.validateSolution();

  return {
    status,
    objectiveValue: m.objectiveValue,
    x: x.value,
    y: y.value,
    valid: report.valid,
  };
}
```

### Example C: Z3 Feasibility Check & Unsat Core Diagnosis

```ts
import { Model, expr, implies } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

export async function runZ3Example() {
  const m = new Model("PolicyCheck", { solver: "z3" });
  const vip = m.bool("vip");
  const discount = m.integer("discount", { lb: 0, ub: 50 });

  m.constraint(vip, "customer_is_vip");
  m.constraint(implies(vip, expr`${discount} >= 20`), "vip_min_discount");
  m.constraint(expr`${discount} <= 10`, "campaign_cap");

  const unsatResult = await m.check();
  return {
    status: unsatResult.status,
    conflicts: unsatResult.conflicts,
  };
}
```

---

## 4. Negative Examples & Common Pitfalls

Avoid these invalid patterns and retired aliases:

```ts
import { Model, expr, maximize } from "@ohtaman/washi";

export function verifyNegativePatterns() {
  const m = new Model("NegativeExamples");
  const x = m.continuous("x", { lb: 0 });
  const y = m.continuous("y", { lb: 0 });

  // 1. DO NOT pass a Constraint to m.objective() or arithmetic methods:
  // WRONG: m.objective(maximize(expr`${x} <= 10` as any)); -> throws Error
  // WRONG: expr`${x} + 1`.add(expr`${y} <= 5` as any); -> throws Error

  // 2. DO NOT pass an arithmetic expression without (<=, >=, ==) to m.constraint():
  // WRONG: m.constraint(expr`${x} + ${y}` as any); -> throws Error

  // 3. DO NOT use quadratic terms inside linear constraints:
  // WRONG: expr`${x}^2 <= 10`; -> throws Error ("Quadratic constraints are not supported")

  // 4. DO NOT use retired aliases (removed in #59 / #81):
  // - Use `expr` instead of retired `c` template tag
  // - Use `m.constraint(...)` or `m.subjectTo(...)` instead of `m.constrain(...)` or `m.add(...)`
  // - Use `m.objective(maximize(...))` or `m.maximize = ...` instead of `m.maximize(...)` / `m.setObjective(...)`
  // - Use `await m.solve()` instead of `await m.optimize()`
  // - Use `.le()`, `.ge()`, `.eq()` instead of `.lessThanOrEqual()`, `.greaterThanOrEqual()`, `.equalTo()`
  // - Use `.value` or `m.getValue(...)` instead of `expr.getValue()`
  // - Use `m.variables` / `m.constraints` instead of `m.vars` / `m.constrs`
  return { m, x, y, maximize };
}
```

---

## 5. Verification & Agent Evaluation Procedure

1. **Automated Code-Block & Drift Verification (`test/agent-guide.test.ts`)**:
   - The test suite extracts the TypeScript examples in this guide, executes them against the real HiGHS and Z3 WebAssembly engines, verifies expected solutions and `validateSolution()` reports, and asserts that retired aliases and invalid contexts throw descriptive errors.
   - `scripts/check-distribution.mjs` verifies that `docs/getting-started/ai-agents.md` is shipped inside the packed npm tarball (`@ohtaman/washi`).
2. **Representative Agent Evaluation Procedure**:
   - Give an AI coding agent access only to `docs/getting-started/ai-agents.md` and ask it to generate:
     1. **Task 1 (MIP)**: A resource-allocation MIP using indexed variables (`m.integer(...)`), `dot()`, `expr`, `m.constraint()`, `m.objective(maximize(...))`, `await m.solve()`, and `m.validateSolution()`.
     2. **Task 2 (Z3 SMT)**: A satisfiability/conflict check using `new Model({ solver: "z3" })`, `m.bool()`, `implies()`, named `m.constraint(..., "name")` rules, and `await m.check()`.
   - Run the generated code with `npx vitest` or `npx tsx` and confirm both tasks type-check, execute without retired aliases, and pass `validateSolution()` / return the expected `CheckResult`. (This verifies guide completeness on representative tasks without claiming universal performance across all prompts or models.)
