# Ecosystem & From Python (PuLP)

`@ohtaman/washi` is a high-level algebraic modeling layer with built-in HiGHS WebAssembly and optional Z3 and GLPK adapters, bridging the gap between Python modeling libraries like PuLP and low-level JavaScript/WebAssembly solver bindings.

---

## 🧭 JavaScript & TypeScript Optimization Ecosystem

JavaScript and TypeScript developers solving Linear Programming (LP), Mixed-Integer Linear Programming (MIP / MILP), Convex Quadratic Programming (QP), or Satisfiability Modulo Theories (SMT) typically choose among three architectural tiers:

### 1. Algebraic Modeler + Multi-Solver Runtime (`@ohtaman/washi`)

- **What it provides**: A typed algebraic modeling API (`Model`, `Var`, `LinExpr`, `QuadExpr`, `BoolExpr`, `expr`, `sum`, `dot`, `m.indicator`, `m.validateSolution`, `solveColumnGeneration`, `solveBenders`) paired with a built-in **HiGHS** WebAssembly runtime (MIT) and optional **Z3** (MIT) and **GLPK** (GPL-3.0) plugins.
- **How it differs**: Instead of hand-assembling LP strings, coefficient matrices, or JSON row arrays, you write declarative mathematical expressions with TypeScript type checking across `Record<K, Var>` and `Var[]` containers. In browsers, HiGHS runs in a dedicated Web Worker by default with progress callbacks (`onProgress`) and `AbortSignal` cancellation, and you can inspect generated LP formulations (`m.toLpString()`), independently verify primal solutions (`m.validateSolution()`), or diagnose infeasibility (`await m.check()`).
- **Best fit**: Shift scheduling, university timetabling, resource allocation, 2D packing, vehicle routing, portfolio QP, and applications combining optimization with rule conflict diagnosis.

### 2. Raw WebAssembly Solver Bindings (`highs` / `highs-js`, `glpk.js`, `z3-solver`)

These packages provide direct JavaScript/TypeScript bindings to powerful C/C++ solver engines compiled to WebAssembly:

- **[`highs`](https://github.com/lovasoa/highs-js)** (*MIT*): Exposes HiGHS via CPLEX LP / MPS text or matrix inputs (`highs.solve(lpText)`). Ideal when you already generate standard LP/MPS files or want minimal abstraction overhead directly on top of HiGHS.
- **[`glpk.js`](https://github.com/jvail/glpk.js)** (*GPL-3.0*): Exposes GLPK through a structured JSON object schema (`objective`, `subjectTo`, `bounds`). Ideal when you specifically target GLPK's native schema under a GPL-3.0 license.
- **[`z3-solver`](https://www.npmjs.com/package/z3-solver)** (*MIT*): Official Z3 WebAssembly bindings exposing Z3's full AST and SMT context (`Context`, `Solver`, `Optimize`, bitvectors, quantifiers, uninterpreted functions). Ideal when you need low-level SMT theories beyond propositional logic and linear arithmetic.

> [!NOTE]
> **How WaSHI relates to these bindings**: For **HiGHS**, WaSHI compiles upstream [`ERGO-Code/HiGHS`](https://github.com/ERGO-Code/HiGHS) directly to WebAssembly via its C API with zero runtime dependencies. For **GLPK** and **Z3**, WaSHI integrates `glpk.js` and `z3-solver` as optional peer plugins behind a unified `Model` interface—so you can formulate once with `expr`, solve numerical MILPs with HiGHS (`m.solve()`), and diagnose conflicting rules with Z3 (`m.check({ solver: "z3" })`). If you only need raw LP-string evaluation or advanced Z3 SMT theories directly, the upstream bindings are a great standalone choice.

### 3. Pure-JavaScript Solvers (`yalps`, `javascript-lp-solver`)

- **[`yalps`](https://github.com/IanManske/yalps)** (*MIT*) and **[`javascript-lp-solver`](https://github.com/JWally/jsLPSolver)** (*Unlicense*): Pure JavaScript/TypeScript simplex and branch-and-bound solvers with small bundle sizes and zero `.wasm` assets.
- **When they shine**: Lightweight client-side or Node.js LP/MIP problems where avoiding WebAssembly assets and minimizing bundle size matter most.
- **When to step up to WebAssembly / WaSHI**: Larger or tightly constrained MILPs (such as multi-shift rostering, timetabling, or 2D packing) benefit substantially from HiGHS's C++ presolve, cutting planes, and primal heuristics compiled to WebAssembly. Pure-JS LP/MIP libraries also do not provide Convex QP or SMT `unsatCore` conflict diagnosis.

### Comparison Matrix

| Package | Runtime / Engine | License | Modeling Interface | Problem Classes | Best Fit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`@ohtaman/washi`** | Built-in HiGHS WASM + optional Z3 / GLPK | **MIT** *(GLPK plugin is GPL-3.0)* | Algebraic (`expr`, `sum`, `dot`, typed `Var` containers, `indicator`) | LP, MIP / MILP, Convex QP, SMT (`BoolVar`, `unsatCore`) | Full-stack TS/JS optimization, scheduling, QP, conflict diagnosis |
| **`highs` (`highs-js`)** | HiGHS WASM | **MIT** | CPLEX LP / MPS strings or raw column/row inputs | LP, MIP, Convex QP | Direct solving of pre-generated LP/MPS models |
| **`glpk.js`** | GLPK WASM | **GPL-3.0** | JSON schema (`objective`, `subjectTo`, bounds) | LP, MIP | Direct GLPK usage in GPL-3.0-compatible projects |
| **`z3-solver`** | Z3 WASM (`SharedArrayBuffer` threads) | **MIT** | Low-level Z3 AST & SMT `Context` API | SMT, SAT, formal verification, `Optimize` | Custom SMT theories (bitvectors, quantifiers, symbolic verification) |
| **`yalps`** | Pure TypeScript / JS | **MIT** | Object / Map-based LP & MIP schema | LP, MIP | Small-to-medium LP/MIP with zero `.wasm` assets |
| **`javascript-lp-solver`** | Pure JavaScript | **Unlicense** | JSON model object | LP, MIP | Simple LP/MIP with zero `.wasm` assets |

---

## 🐍 From Python (`PuLP`) to WaSHI

If you are coming from Python's **[PuLP](https://github.com/coin-or/pulp)**, WaSHI's modeling workflow maps closely to PuLP while adding TypeScript type safety, browser WebAssembly execution, Convex QP, and SMT conflict diagnosis.

### Side-by-Side Example: Production Planning MIP

::: code-group

```typescript [TypeScript (WaSHI)]
import { Model, expr, maximize } from "@ohtaman/washi";

const products = ["desk", "chair"] as const;
const profit = { desk: 30, chair: 50 };
const wood = { desk: 1, chair: 2 };
const labor = { desk: 2, chair: 1 };

const m = new Model("Production");
const qty = m.integer(products, { lb: 0, ub: 100 });

m.objective(maximize(expr`dot(${profit}, ${qty})`));
m.constraint(expr`dot(${wood}, ${qty}) <= 40`, "wood_limit");
m.constraint(expr`dot(${labor}, ${qty}) <= 50`, "labor_limit");

const status = await m.solve();
const report = m.validateSolution();
console.log(status, report.valid, m.objectiveValue, m.getValues(qty));
// "Optimal", true, 1100, { desk: 20, chair: 10 }
```

```python [Python (PuLP)]
from pulp import LpProblem, LpMaximize, LpVariable, lpSum, LpStatus, value

products = ["desk", "chair"]
profit = {"desk": 30, "chair": 50}
wood = {"desk": 1, "chair": 2}
labor = {"desk": 2, "chair": 1}

prob = LpProblem("Production", LpMaximize)
qty = LpVariable.dicts("qty", products, lowBound=0, upBound=100, cat="Integer")

prob += lpSum(profit[p] * qty[p] for p in products)
prob += lpSum(wood[p] * qty[p] for p in products) <= 40, "wood_limit"
prob += lpSum(labor[p] * qty[p] for p in products) <= 50, "labor_limit"

prob.solve()
print(LpStatus[prob.status], value(prob.objective), {p: value(qty[p]) for p in products})
# Optimal 1100.0 {'desk': 20.0, 'chair': 10.0}
```

:::

### Concept & API Mapping Table

| Concept | Python (`PuLP`) | TypeScript / JavaScript (`@ohtaman/washi`) |
| :--- | :--- | :--- |
| **Create model** | `prob = LpProblem("Name", LpMaximize)` | `const m = new Model("Name")` + `m.objective(maximize(...))` |
| **Scalar variables** | `LpVariable("x", lowBound=0, upBound=10, cat="Integer")` | `m.integer("x", { lb: 0, ub: 10 })` (`continuous`, `integer`, `binary`, `bool`) |
| **Indexed variables** | `LpVariable.dicts("x", keys, lowBound=0)` | `m.integer(keys, { lb: 0 })` -> typed `Record<K, Var>` (or pass numbers for `Var[]` / `Var[][]`) |
| **Weighted sums** | `lpSum(c[k] * x[k] for k in keys)` | `` expr`dot(${c}, ${x})` `` or `sum(keys, (k) => expr\`...\`)` |
| **Add constraints** | `prob += expr <= 40, "limit"` | `m.constraint(expr\`... <= 40\`, "limit")` |
| **Conditional / Big-M** | Manual Big-M linear inequality | `m.indicator(binVar, constraint, { activeValue: 0 })` (auto-derives tight Big-M from `lb`/`ub`) |
| **Solve** | `prob.solve()` (uses CBC / configured solver) | `await m.solve()` (built-in HiGHS WASM; or `{ solver: "glpk" }` / `{ solver: "z3" }`) |
| **Inspect LP** | `prob.writeLP("model.lp")` | `m.toLpString()` |
| **Read results** | `LpStatus[prob.status]`, `value(x)`, `value(prob.objective)` | `status`, `x.value`, `m.getValues(qty)`, `m.objectiveValue`, `c.dual`, `c.slack` |
| **Verify & diagnose** | Manual checks | `m.validateSolution()` & `await m.check()` (`conflicts` / Z3 `unsatCore`) |

### Beyond PuLP in TypeScript & Browser Apps

- **Single runtime from browser UI to Node.js**: Run the exact same model in Node.js APIs/CLIs or locally inside browser Web Workers without hosting a Python backend.
- **Convex Quadratic Programming (`QuadExpr`)**: Minimize quadratic terms such as `` expr`sum((${x} - ${target})^2)` `` directly on continuous models with HiGHS.
- **Logical Constraints & Infeasibility Diagnosis**: Express `implies`, `and`, `or`, `xor`, and `not` directly, and pinpoint contradictory rules with `await m.check()` (HiGHS elastic repair or Z3 `unsatCore`).
- **Built-in Decomposition Helpers**: Orchestrate Column Generation (`solveColumnGeneration`) and Benders Decomposition (`solveBenders`) for large-scale routing and cutting-stock problems.

---

## 🧭 Next Steps

- **[Introduction & Installation](./index.md)**: Install `@ohtaman/washi` and run your first model
- **[Solvers Overview](../solvers/index.md)**: Compare HiGHS, Z3, GLPK, and custom solver adapters
- **[Variables & Domains](../guide/variables.md)**: Typed `Record` and array variable containers
- **[Examples & API Finder](../examples/index.md)**: 11 complete LP, MILP, QP, and SMT recipes
- **[AI Agent Quick-Reference](./ai-agents.md)**: Compact reference and portable `SKILL.md` for AI coding agents
