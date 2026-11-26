# Solvers Overview

WaSHI uses a pluggable solver architecture. You write a model once with the unified algebraic API, then run it with the backend that matches your problem class and runtime constraints.

---

## Solvers Matrix & Comparison

| Solver | License | Problem Classes & Domains | Best For | Packaging & Preconditions |
| :--- | :--- | :--- | :--- | :--- |
| **[HiGHS](./highs.md)** | **MIT** | **LP, MIP, Convex QP** (continuous, integer, boolean) | Production optimization, operations research, portfolio QP | **Bundled default** (zero extra deps, no extra import; subpath API: `@ohtaman/washi/solvers/highs`) |
| **[Pumpkin](./pumpkin.md)** | **MIT** | **CP, Propositional Logic** (bounded integer & boolean only; no `Continuous`) | Non-overlapping scheduling, CP global constraints, discrete `unsatCore` | **Bundled** (`{ solver: "pumpkin" }`, zero extra deps, no extra import; subpath API: `@ohtaman/washi/solvers/pumpkin`) |
| **[Z3](./z3.md)** (`z3-solver`) | **MIT** | **SMT, SAT, LP/MIP** (continuous, integer, boolean) | Logical rules with continuous variables or decimal coefficients, mixed continuous/integer `unsatCore` diagnosis | **Optional peer** (`@ohtaman/washi/solvers/z3`, requires `z3-solver`); browsers require a Secure Context (`HTTPS`/`localhost`) and `COOP`/`COEP` headers |
| **[GLPK](./glpk.md)** (`glpk.js`) | **GPL-3.0** | **LP, MIP** (continuous, integer) | Academic benchmarks, legacy GLPK compatibility | **Optional peer** (`@ohtaman/washi/solvers/glpk`, requires `glpk.js`; note GPL-3.0 license) |
| **Mock** (`MockSolver`) | **MIT** | *Any* (fixed-response stub) | Fast CI unit tests without loading WebAssembly | **Built-in** (`solver: "mock"` or `new MockSolver(...)`) |

---

## Selecting a Solver

Bundled **HiGHS** (default) and **Pumpkin** (`{ solver: "pumpkin" }`) are ready out of the box with no extra imports. For optional peer plugins (**Z3** and **GLPK**), import the plugin at the top of your module, then choose a solver when constructing `Model` or per call in `solve()` / `check()`:

```typescript
import { Model, MockSolver, expr, maximize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";
import "@ohtaman/washi/solvers/glpk";

// 1. Default solver on Model (HiGHS is bundled & default; Pumpkin works with { solver: "pumpkin" })
const m = new Model({ solver: "highs" });
const x = m.integer("x", { lb: 0, ub: 10 });
m.objective(maximize(expr`${x}`));

// 2. Override solver per solve() or check() call
await m.solve({ solver: "highs" });
await m.solve({ solver: "glpk" });
// check() ignores the objective and checks constraint satisfiability only
await m.check({ solver: "pumpkin" });
await m.check({ solver: "z3" });

// 3. Deterministic unit testing without WebAssembly
const mock = new MockSolver({ status: "Optimal", objectiveValue: 10, values: { x: 10 } });
await m.solve({ solver: mock });
```

See [Conflict Diagnosis, Validation & Debugging](../guide/unsat-core.md) for full `MockSolver` testing patterns.

---

## Solver Guides

- [HiGHS Solver Guide](./highs.md): Background Web Worker execution, MIP tolerances, Convex QP solving, and progress callbacks.
- [Pumpkin Solver Guide](./pumpkin.md): Bundled CP / Lazy Clause Generation (LCG) solver, global constraints, warm starts, and discrete `unsatCore` diagnosis.
- [Z3 Solver Guide](./z3.md): SMT logical constraints, `Continuous` / decimal rules, `unsatCore` extraction, and browser `COOP`/`COEP` setup.
- [GLPK Solver Guide](./glpk.md): GLPK adapter setup, GPL-3.0 licensing notes, and status mapping.
- [Custom Solvers](./custom-solver.md): Developer guide for integrating commercial/proprietary, cloud REST, or custom WASM solvers.
