# GLPK Solver Engine

The **GNU Linear Programming Kit (GLPK)** is an open-source simplex and branch-and-cut solver for Linear Programming (LP) and Mixed-Integer Programming (MIP).

---

## When to Choose GLPK vs. HiGHS

| Scenario | Recommended Solver | Why |
| :--- | :--- | :--- |
| **General LP or MIP optimization** | **[HiGHS](./highs.md)** (default) | Bundled under MIT, faster on MIP, non-blocking Web Worker, warm starts, and full LP duals/slacks/reduced costs. |
| **Academic benchmarks or cross-checking GLPK models** | **GLPK** (`@ohtaman/washi/solvers/glpk`) | Matches GNU GLPK 5.0 behavior when reproducing existing GLPK benchmarks or verifying results across solvers. |

---

## Installation

GLPK is provided as an optional peer dependency via `glpk.js`:

```bash
npm install glpk.js
```

---

## Licensing Consideration (GPL-3.0)

GLPK is licensed under the **GNU General Public License v3.0 (GPL-3.0)**:

- Because WaSHI is MIT-licensed, `glpk.js` is **never bundled statically** in the core package.
- It is loaded dynamically only when you explicitly import `@ohtaman/washi/solvers/glpk`.
- Verify that your distribution strategy complies with GPL-3.0 before shipping products that bundle GLPK.

---

## Basic Usage

Import `@ohtaman/washi/solvers/glpk` once to register the `"glpk"` solver, then build and solve LP or MIP models using the standard `Model` API:

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/glpk";

const model = new Model({ solver: "glpk" });

const x = model.continuous("x", { lb: 0, ub: 10 });
const y = model.continuous("y", { lb: 0, ub: 20 });

model.objective(maximize(expr`3 * ${x} + 2 * ${y}`));
const cap = model.constraint(expr`${x} + ${y} <= 15`, "cap");

await model.solve();

console.log("GLPK Status:", model.status);      // Optimal
console.log("Objective:", model.objectiveValue); // 40
console.log("Shadow price:", cap.dual);          // 2
```

---

## Solver Options & Execution Model

WaSHI's `useWorker: true` option is not supported on GLPK and throws an `Error` (in browsers, `glpk.js` uses its own internal Web Worker automatically, while in Node.js it executes synchronously on the main thread). In all environments, `signal` is checked only before solving begins and cannot interrupt an in-flight solve.

### Supported Options

| Option | Type | Description |
| :--- | :--- | :--- |
| `timeLimit` | `number` | Maximum solve time in seconds (`tmlim`). |
| `relativeGap` | `number` | Relative MIP optimality gap tolerance (`mipgap`). |
| `presolve` | `"on" \| "off" \| "choose"` | Controls GLPK presolve (`"off"` disables it; `"on"` and `"choose"` enable it). |
| `verbose` | `boolean` | Enables GLPK console logging (`false` by default). |
| `relax` | `boolean` | Solves the continuous LP relaxation of a MIP model. |
| `signal` | `AbortSignal` | Checked before execution starts (cannot interrupt an in-flight synchronous solve). |
| `onProgress` | `(ev) => void` | Invoked during MIP branch-and-cut callbacks, or once when the solve completes. |

### Unsupported Options & Features (Throw at Runtime)

- **`outputFlag`**: Throws an `Error`. Use `verbose: true` instead.
- **Other unsupported options**: `absoluteGap`, `threads`, `useWorker: true`, and unknown option keys throw an `Error`.
- **Unsupported model features**: Setting `initialValue` warm starts or a `QuadExpr` quadratic objective throws an `Error`.

---

## Result Semantics & Status Mapping

### Solver Statuses

GLPK return codes map strictly to WaSHI `SolverStatus`:

| GLPK Code | WaSHI Status | Meaning |
| :--- | :--- | :--- |
| `GLP_OPT` (5) | `"Optimal"` | Proven optimal solution found. |
| `GLP_FEAS` (2) | `"Feasible"` | Feasible solution found (optimality not proven). |
| `GLP_INFEAS` (3) / `GLP_NOFEAS` (4) | `"Infeasible"` | No feasible solution exists. |
| `GLP_UNBND` (6) | `"Unbounded"` | Objective is unbounded. |
| `GLP_UNDEF` (1) / other | `"Unknown"` | Undefined or unrecognized status (never mapped to `"Optimal"`). |

### Solution Availability

- Variable values (`model.values`, `var.value`) and `model.objectiveValue` are populated only for `"Optimal"` or `"Feasible"` outcomes.
- On `"Infeasible"`, `"Unbounded"`, `"Unknown"`, or `"Error"` outcomes, `model.objectiveValue` and variable values remain `null`.

### Differences Between LP and MIP

- **Linear Programming (LP)**: Solved via simplex. For sensitivity information on optimal solutions, only constraint duals (`c.dual`) are populated; `c.slack` and `v.reducedCost` remain `null`.
- **Mixed-Integer Programming (MIP)**: Solved via branch-and-cut. MIP models do not produce LP duals, and `glpk.js` does not expose MIP dual bounds or gaps (`objectiveBound`, `relativeGap`, and `absoluteGap` remain `undefined`).
