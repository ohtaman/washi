# Solvers Overview

WaSHI is designed around a pluggable, decoupled solver architecture. You formulate mathematical models using a unified algebraic API, then solve them with the engine best suited for your problem class.

---

## ⚡ Solvers Matrix & Comparison

| Solver | Engine License | Problem Classes | Best For | Status in WaSHI |
| :--- | :--- | :--- | :--- | :--- |
| **HiGHS** | **MIT** | **LP, MIP, Convex QP** | Industrial-scale optimization, operations research, finance | **Built-in default** (zero configuration) |
| **Z3** | **MIT** | **SMT, SAT, Logic, MIP** | Propositional logic, conflict diagnosis (`unsatCore`), rule engines | Optional plugin (`@ohtaman/washi/solvers/z3`) |
| **GLPK** | **GPL-3.0** | **LP, MIP** | Academic benchmarks, legacy GLPK compatibility | Optional plugin (`@ohtaman/washi/solvers/glpk`) |
| **Mock** | **MIT** | *Any* | Ultra-fast unit testing in CI without loading WebAssembly | Built-in |

---

## Selecting a Solver

Specify the solver by name when creating your `Model`:

```typescript
// 1. Built-in HiGHS (default)
const m1 = new Model({ solver: "highs" });

// 2. Z3 SMT solver
import "@ohtaman/washi/solvers/z3";
const m2 = new Model({ solver: "z3" });

// 3. GLPK solver
import "@ohtaman/washi/solvers/glpk";
const m3 = new Model({ solver: "glpk" });
```

---

## Solver Guides

- [HiGHS Guide](./highs.md): Web Worker multithreading, MIP tolerances, and QP solving.
- [Z3 Guide](./z3.md): SMT assertions, logic modeling, and Unsat Core analysis.
- [GLPK Guide](./glpk.md): GLPK adapter, GPL-3.0 licensing considerations, and browser usage.
- [Custom Solvers](./custom-solver.md): Step-by-step developer tutorial for integrating proprietary or cloud REST solvers.
