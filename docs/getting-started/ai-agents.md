# AI Coding Agent Quick-Reference Guide

> **Scope Note**: This document is the **consumer modeling quick-reference** for AI coding agents and developers building optimization or satisfiability models with `@ohtaman/washi`.
>
> - **Portable Agent Skill**: Install [`skills/washi/SKILL.md`](https://github.com/ohtaman/washi/blob/main/skills/washi/SKILL.md) (also shipped at `node_modules/@ohtaman/washi/skills/washi/SKILL.md`) for an end-to-end modeling, verification, and conflict-diagnosis workflow:
>   ```bash
>   # Install directly via the skills CLI (skills.sh / vercel-labs/skills)
>   npx skills add ohtaman/washi
>
>   # Or copy the packaged skill into your project's agent skills directory
>   mkdir -p .agents/skills/washi
>   cp node_modules/@ohtaman/washi/skills/washi/SKILL.md .agents/skills/washi/SKILL.md
>   ```
> - **Repository Review Guidelines**: See [`AGENTS.md`](https://github.com/ohtaman/washi/blob/main/AGENTS.md) in the repository root.

---

## 1. Package Imports & Deployment

### Node.js / Bundlers (Vite, Webpack, Next.js, Bun)

```ts
import {
  Model,
  expr,
  sum,
  dot,
  abs,
  max,
  min,
  at,
  distinct,
  disjoint,
  cumulative,
  allowed,
  maximize,
  minimize,
  and,
  or,
  not,
  implies,
  xor,
  setHighsWasmUrl,
} from "@ohtaman/washi";

// Bundled Constraint Programming (CP) solver plugin (zero external dependencies; registers "pumpkin"):
import { setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";
// Optional solver plugins (require installing peer dependencies first):
// npm install z3-solver
import "@ohtaman/washi/solvers/z3";
// npm install glpk.js
import "@ohtaman/washi/solvers/glpk";
```

### Browser ESM & Classic Script Tags

Classic `<script>` tags load Immediately Invoked Function Expression (`IIFE`) bundles that attach globals to `window`:

| Solver | Browser ESM (`<script type="module">`) | Classic `<script>` IIFE |
| --- | --- | --- |
| **Core (HiGHS)** | `import { Model, expr, maximize } from "./washi/washi.js";` | `<script src="./washi/washi.min.js"></script>` (global `Washi`) |
| **Pumpkin** | `import "./washi/solvers/pumpkin.js";` | `<script src="./washi/solvers/pumpkin.min.js"></script>` (`WashiPumpkin`) |
| **GLPK** | `import "./washi/solvers/glpk.js";` | `<script src="./washi/solvers/glpk.min.js"></script>` (`WashiGLPK`) |
| **Z3** | `import "./washi/solvers/z3.js";` | `<script src="./washi/solvers/z3.min.js"></script>` (`WashiZ3`) |

### WebAssembly Asset & Runtime Rules

#### Bundled WASM & Custom Asset URLs

- **Automatic resolution**: Node.js and bundlers resolve `.wasm` assets relative to the module with zero CDN fallback.
- **Browser self-hosting**: Deploy `dist/browser/` intact (entry scripts, sibling chunks, Workers, and `.wasm` files). Missing URLs or HTML SPA fallbacks fail immediately and report the attempted URL.
- **Custom browser URLs**: Call `setHighsWasmUrl(url)` or `setPumpkinWasmUrl(url)`, or pass `{ wasmUrl }` to `m.solve()` / `m.check()`. (Ignored for HiGHS in Node.js; Pumpkin in Node.js accepts `file://` URLs.)

#### Browser Security & Cross-Origin Isolation

- **HiGHS, Pumpkin, and GLPK**: Run in standard browser contexts without `SharedArrayBuffer` or isolation headers.
- **Z3 browser preconditions**: Z3 uses `SharedArrayBuffer` multithreading, so browsers require a Secure Context (`window.isSecureContext === true`, HTTPS or `localhost`) and `window.crossOriginIsolated === true`.
- **Required Z3 headers**: Serve the document with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (`COOP`/`COEP`). Cross-origin script and WASM assets also require `Cross-Origin-Resource-Policy: cross-origin` (`CORP`) and `Access-Control-Allow-Origin`.
- **Fail-fast check**: Importing `@ohtaman/washi` never auto-injects a Service Worker. Z3 rejects immediately if a Secure Context or Cross-Origin Isolation is missing.

#### Web Workers & Cancellation (`AbortSignal`)

- **Default Workers**: On non-opaque browser origins where `window.origin !== "null"`, HiGHS and Pumpkin default to Web Workers (`useWorker: true`). On opaque origins where `window.origin === "null"` (such as `file:` or sandboxed iframes), both default to `useWorker: false`.
- **Cancellation behavior**: Pre-solve cancellation (`signal.aborted`) works on all solvers, and `{ signal }` terminates in-flight Worker runs immediately. On the main thread or Node.js, HiGHS checks `signal` inside `onProgress` callbacks, Pumpkin polls `signal` during search checkpoints, and GLPK/Z3 check before starting.

#### Solver Capabilities & Unsupported Options (Throw on Pass)

| Solver | Problem Classes | Accepted Options | Throws On |
| --- | --- | --- | --- |
| **HiGHS** *(default)* | Linear (`LP`), Mixed-Integer (`MIP`), convex Quadratic (`QP`) | `timeLimit`, `presolve`, `relativeGap`, `absoluteGap`, `outputFlag`, `relax`, `useWorker`, `wasmUrl`, `signal`, `onProgress`, `initialValue` | `threads`, `verbose` (use `outputFlag`), unknown keys, MIQP (quadratic objective with integer/binary/boolean variables) |
| **Pumpkin** | Constraint Programming (`CP`), bounded discrete `unsatCore` | `timeLimit`, `useWorker`, `wasmUrl`, `signal`, `onProgress`, `initialValue` | `relax: true`, `presolve`, `relativeGap`, `absoluteGap`, `threads`, `verbose`, `outputFlag`, unknown keys, `Continuous` variables, unbounded or out-of-range (`[-(2^30 - 1), 2^30 - 1]`) bounds, fractional coefficients/RHS, `QuadExpr` |
| **Z3** | Satisfiability Modulo Theories (`SMT`), continuous/discrete `unsatCore` | `signal`, `onProgress`, `z3JsUrl`, `z3WasmUrl` | `relax: true`, `useWorker: true`, `timeLimit`, `presolve`, `relativeGap`, `absoluteGap`, `threads`, `verbose`, `outputFlag`, unknown keys, `QuadExpr`, `initialValue` |
| **GLPK** | `LP`, `MIP` | `timeLimit`, `presolve`, `relativeGap`, `verbose`, `relax`, `signal`, `onProgress` | `useWorker: true`, `absoluteGap`, `threads`, `outputFlag` (use `verbose`), unknown keys, `QuadExpr`, `initialValue` |

---

## 2. Canonical Modeling Workflow

Formulating and solving a model consists of four distinct steps:

### Step 1: Create Model & Decision Variables

```ts
const m = new Model("ExampleModel");

// Scalar variables
const x = m.continuous("x", { lb: 0, ub: 100 });
const y = m.continuous("y", { lb: 0, ub: 100 });
const n = m.integer("n", { lb: 0, ub: 10 });
const b = m.binary("b");
const flag = m.bool("flag"); // Propositional boolean (auto 0-1 MIP on HiGHS/GLPK, native CP/SMT on Pumpkin/Z3)

// Indexed variable containers:
// - Numeric dimension -> Array
// - Key-array dimension -> Record
const vec = m.continuous(4, { lb: 0, prefix: "v" }); // Var[] (length 4)
const grid = m.binary(2, 3, { prefix: "g" }); // Var[][] (2x3)
const byItem = m.integer(["desk", "chair"] as const, { lb: 0 }); // Record<"desk" | "chair", Var>
const mixed = m.binary(["A", "B"] as const, 3); // Record<"A" | "B", Var[]>
```

- **Primal hints**: Numeric variable constructors and `v.initialValue` accept a finite starting value, validated against `[lb, ub]` and integrality (tolerance `1e-6`) and kept distinct from solved `v.value`.
- **Hint semantics**: Complete or partial warm starts do not fix variables, add hard constraints, or guarantee solver acceptance or speedup.
- **Warm-start support**: Supported by HiGHS and Pumpkin (`supportsWarmStart: true`). GLPK and Z3 throw if any variable defines `initialValue`.

### Step 2: Build Expressions (`expr`, `sum`, `dot`, `max`, `min`, `abs`, `at`)

#### Unified `expr` Template Tag

| Form | Examples | Notes |
| --- | --- | --- |
| Linear (`LinExpr`) | `` expr`30 * ${x} + 50 * ${n} - 10` ``, `` expr`dot(${profit}, ${byItem}) - 20 * ${b}` `` | Also supports `` expr`sum((${price} - ${cost}) * ${byItem})` ``. |
| Piecewise & element | `` expr`max(${vec}) + sum(abs(${vec} - ${target}))` ``, `` expr`at(${costs}, ${idx})` `` | 0-based integer `idx` enforces $0 \le \text{idx} < \text{costs.length}$. Convex directions stay pure LP on HiGHS/GLPK; non-convex contexts require finite bounds. |
| Quadratic (`QuadExpr`) | `` expr`${x}^2 + 2 * ${x} * ${y} + ${y}^2` ``, `` expr`sum((${vec} - ${target})^2)` `` | Supported for convex QP objectives on continuous models (`m.continuous`); HiGHS rejects MIQP. |
| Constraint (`Constraint`) | `` expr`${x} + 2 * ${n} <= 40` ``, `` expr`sum(${byItem}) <= 100` `` | Supports `<=`, `>=`, `==`, `=`, plus discrete integer-only `<`, `>`, `!=`. |

#### Aggregations & Fluent Methods

- **`sum(containerOrItems, mapper?)`**: Sums a 1D/2D `Array`, `Iterable`, or plain `Record` of variables, expressions, or numbers, or maps via a callback. Inside `` expr`sum(...)` ``, element-wise `+`, `-`, `*`, `/`, `^2`, and `abs(...)` also work.
- **`dot(a, b)`**: Computes the inner product of matching 1D arrays, 2D arrays (Frobenius inner product $\sum_{i,j} A_{i,j} B_{i,j}$), plain records, or mixed Array/Record containers.
- **Fluent arithmetic & comparisons**: `.add()`, `.sub()`, `.mul()`, `.div(scalar)`, `.neg()`, plus `.le(rhs, name?)`, `.ge()`, `.eq()`, and integer-only `.lt()`, `.gt()`, `.ne()` (continuous/fractional operands throw).

#### CP Global Constraints & Boolean Logic

| Helper | Purpose | Solver Lowering |
| --- | --- | --- |
| `distinct(...args)` | All variables take pairwise distinct values | Native on Pumpkin and Z3; pairwise `!=` on HiGHS/GLPK. |
| `disjoint(tasks)` | Non-overlapping intervals (`{ start, duration }`) | Native scheduling propagator on Pumpkin; linearized on MIP solvers. |
| `cumulative(tasks, capacity)` | Shared resource capacity (`{ start, duration, demand }`) | Native propagator on Pumpkin; MIP time-indexed encoding enforces a horizon memory guard. |
| `allowed(vars, tuples)` | Restrict variable tuples to an allowed table | Native table propagator on Pumpkin; linearized on MIP solvers. |
| `and`, `or`, `not`, `implies`, `xor` | Composable boolean logic (standalone or fluent) | Native on Pumpkin and Z3; 0-1 MIP on HiGHS/GLPK (negated continuous constraints throw on MIP—use `{ solver: "z3" }` or `m.bool()`). |

### Step 3: Register Objective & Constraints on the Model

Constructing an `expr` or `.le()` object does **not** attach it to the model until you call `m.constraint(...)` or `m.objective(...)`. In `m.indicator()`, omitting `options.M` derives tight Big-M bounds for MIP solvers while keeping native indicator lowering on Pumpkin and Z3:

```ts
// Set objective using maximize() or minimize()
m.objective(maximize(expr`30 * ${x} + 50 * ${n}`));

// Register constraints on the model (returns the registered Constraint / BoolExpr or array)
const limit = m.constraint(expr`${x} + 2 * ${n} <= 40`, "resource_limit");

// Indicator constraint (MIP Big-M reformulation: b === 1 => x <= 50)
m.indicator(b, expr`${x} <= 50`, { activeValue: 1, name: "cap_when_b" });
```

### Step 4: Execute (`solve` or `check`) & Verify (`verify`)

#### Optimization (`await m.solve(options?)`)

- **Return value**: Returns `SolverStatus` (`"Optimal"`, `"Feasible"`, `"Infeasible"`, `"Unbounded"`, `"TimeLimit"`, `"IterationLimit"`, `"Error"`, `"Unknown"`, `"NotSolved"`, `"Sat"`, or `"Unsat"`).
- **Status semantics**: Optimization solvers return `"Feasible"` when a limit or abort stops with a valid primal incumbent. `"Sat"` and `"Unsat"` apply to satisfiability or custom solver adapters.
- **Reading results**: Check `m.hasPrimalSolution`, then read `x.value`, `` expr`...`.value ``, `m.values`, `m.objectiveValue`, `constr.dual`, `constr.slack`, and `x.reducedCost`. Inspect entities via `m.variables` and `m.constraints` (`ReadonlyMap`).
- **Independent verification**: Call `m.verify()` to check finiteness, variable bounds, integrality, and linear/logical constraints (`VerificationReport`: `{ valid, complete, maxViolation, violations }`). It checks primal feasibility only and does not recompute `m.objectiveValue`.

#### Satisfiability & Conflict Diagnosis (`await m.check(options?)`)

- **Return value**: Returns `CheckResult` (`{ status: "Sat" | "Unsat" | "Unknown", values: Record<string, number | boolean>, conflicts?: readonly string[], unsatCore?: readonly string[], runTime?: number }`).
- **HiGHS & GLPK**: Diagnose linear and logical conflicts in `conflicts` via slack relaxation, leaving `unsatCore` as `undefined`.
- **Pumpkin & Z3**: Extract an exact unsatisfiable core into both `unsatCore` and `conflicts`. Use Pumpkin for bounded integer/boolean models and Z3 when continuous or fractional constraints are present.
- **Bounds caveat**: Variable bounds `lb`/`ub` and binary domains are asserted directly, so `unsatCore` reports constraint names that conflict *together with those fixed bounds* (not guaranteed minimal).

#### Concurrent Mutation Rule

- Mutating variables, constraints, or the objective while `await m.solve()` or `await m.check()` is pending invalidates the in-flight run and rejects the stale promise.

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

  m.objective(maximize(expr`dot(${profit}, ${qty}) - 20 * ${setup}`));
  m.constraint(expr`dot(${woodPerUnit}, ${qty}) <= 40`, "wood_cap");
  m.constraint(expr`dot(${laborPerUnit}, ${qty}) <= 50`, "labor_cap");
  m.indicator(setup, expr`sum(${qty}) <= 0`, {
    activeValue: 0,
    name: "require_setup",
  });

  const status = await m.solve();
  const report = m.verify();
  const values = { desk: qty.desk.value, chair: qty.chair.value };

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

Variable-by-variable products `${x} * ${y}` and squares `${x}^2` are supported in `expr` for quadratic objectives:

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
  const report = m.verify();

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

### Example D: Pumpkin CP Scheduling & Discrete Unsat Core

```ts
import { Model, expr, disjoint, distinct, implies, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export async function runPumpkinExample() {
  // Part 1: Bounded-integer CP scheduling with native global propagators
  const cpModel = new Model("WorkshopSchedule", { solver: "pumpkin" });
  const start = cpModel.integer(["cut", "weld", "paint"] as const, { lb: 0, ub: 20, prefix: "start" });
  const bench = cpModel.integer(["cut", "weld", "paint"] as const, { lb: 1, ub: 3, prefix: "bench" });

  cpModel.constraint(
    disjoint([
      { start: start.cut, duration: 4 },
      { start: start.weld, duration: 3 },
      { start: start.paint, duration: 2 },
    ]),
    "single_line"
  );
  cpModel.constraint(expr`${start.cut} + 4 <= ${start.weld}`, "cut_before_weld");
  cpModel.constraint(expr`${start.weld} + 3 <= ${start.paint}`, "weld_before_paint");
  cpModel.constraint(distinct(bench), "unique_benches");
  cpModel.objective(minimize(expr`${start.paint} + 2`));

  const status = await cpModel.solve();
  const report = cpModel.verify();

  // Part 2: Discrete unsatCore diagnosis on bounded integers & booleans
  const unsatModel = new Model("DiscreteConflict", { solver: "pumpkin" });
  const vip = unsatModel.bool("vip");
  const discount = unsatModel.integer("discount", { lb: 0, ub: 50 });

  unsatModel.constraint(vip, "customer_is_vip");
  unsatModel.constraint(implies(vip, expr`${discount} >= 20`), "vip_min_discount");
  unsatModel.constraint(expr`${discount} <= 10`, "campaign_cap");

  const unsatResult = await unsatModel.check();
  return {
    status,
    makespan: cpModel.objectiveValue,
    starts: { cut: start.cut.value, weld: start.weld.value, paint: start.paint.value },
    benches: { cut: bench.cut.value, weld: bench.weld.value, paint: bench.paint.value },
    valid: report.valid,
    unsatStatus: unsatResult.status,
    conflicts: unsatResult.conflicts,
    unsatCore: unsatResult.unsatCore,
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

  // 4. DO NOT use retired aliases (removed in #59 / #81 / #236 / #273):
  // - Use `expr` instead of retired `c` template tag
  // - Use `m.constraint(...)` instead of `m.constrain(...)` or `m.add(...)`
  // - Use `m.objective(maximize(...))` / `m.objective(minimize(...))` / `m.objective()` instead of `m.maximize(...)` / `m.minimize(...)` / `m.setObjective(...)` / `m.objectiveExpr`
  // - Use `await m.solve()` instead of `await m.optimize()`
  // - Use `m.verify()` instead of `m.validateSolution()` (and rely on automatic integrity validation in `solve()` / `check()` / `toLpString()` instead of `m.validateIntegrity()`)
  // - Use `m.column(...)` instead of `m.addColumn(...)`
  // - Use `.le()`, `.ge()`, `.eq()` instead of `.lessThanOrEqual()`, `.greaterThanOrEqual()`, `.equalTo()`
  // - Use `.value` instead of `m.getValues(...)` or `expr.getValue()`
  // - Use `m.variables` / `m.constraints` (`ReadonlyMap` with `.get()` / `.size`) instead of `m.vars` / `m.constrs` / `m.boolVars` / `m.logicalConstraints` / `m.numVars` / `m.numConstrs` / `get*ByName()`
  // - Use `relativeGap` / `absoluteGap` instead of `relGap` / `mipGap` / `absGap`
  return { m, x, y, maximize };
}
```

### Practical OR Modeling Guardrails

- **Prefer inequalities over equalities**: Use `>=` and `<=` for demand coverage and resource caps when costs are positive. Reserve `==` for conservation laws such as flow balance or weights summing to `1`.
- **Provide finite bounds for `m.indicator()`**: Give referenced variables finite `lb` and `ub` bounds and omit `M` so WaSHI derives a tight Big-M. Infinite bounds without an explicit `M` throw an error.
- **Model non-rigid targets as soft constraints**: Add a non-negative slack variable (`lb: 0`) with an objective penalty for preferences like safety stock or day-off requests. Reserve hard constraints for physical or legal invariants.
