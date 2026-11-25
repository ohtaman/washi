# Solvers Overview

WaSHI uses a pluggable solver architecture. You write a model once with the unified algebraic API, then run it with the backend that matches your problem class and runtime constraints.

---

## Solvers Matrix & Comparison

| Solver | License | Problem Classes | Best For | Status & Preconditions |
| :--- | :--- | :--- | :--- | :--- |
| **[HiGHS](https://github.com/ERGO-Code/HiGHS)** | **MIT** | **LP, MIP, Convex QP** | Production optimization, operations research, portfolio QP | **Built-in default** (zero configuration) |
| **[Pumpkin](https://github.com/ConSol-Lab/Pumpkin)** | **MIT** | **CP, Propositional Logic, Bounded Integer** (via LCG) | Non-overlapping scheduling, CP global constraints, discrete `unsatCore` | **Bundled plugin** (`@ohtaman/washi/solvers/pumpkin`); requires finite-bound integer or boolean variables only (no `Continuous` variables) |
| **[Z3](https://github.com/Z3Prover/z3)** (`z3-solver`) | **MIT** | **SMT, SAT, LP/MIP** (with logical constraints) | Logical rules with continuous variables or decimal coefficients, mixed continuous/integer `unsatCore` diagnosis | **Optional peer** (`@ohtaman/washi/solvers/z3`, requires `z3-solver`); browsers require `COOP`/`COEP` headers |
| **[GLPK](https://www.gnu.org/software/glpk/)** (`glpk.js`) | **GPL-3.0** | **LP, MIP** | Academic benchmarks, legacy GLPK compatibility | **Optional peer** (`@ohtaman/washi/solvers/glpk`, requires `glpk.js`; note GPL-3.0 license) |
| **Mock** (`MockSolver`) | **MIT** | *Any* (fixed-response stub) | Fast CI unit tests without loading WebAssembly | **Built-in** (`solver: "mock"` or `new MockSolver(...)`) |

---

## Selecting a Solver

Import any plugin solver at the top of your module, then choose a solver when constructing `Model` or per call in `solve()` / `check()`:

```typescript
import { Model, MockSolver, expr, maximize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";
import "@ohtaman/washi/solvers/z3";
import "@ohtaman/washi/solvers/glpk";

// 1. Default solver on Model (HiGHS is built-in)
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
- [GLPK Solver Guide](./glpk.md): GLPK adapter setup, GPL-3.0 licensing notes, and browser usage.
- [Custom Solvers](./custom-solver.md): Developer guide for integrating commercial/proprietary, cloud REST, or custom WASM solvers.
