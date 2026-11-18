# Solvers Overview

WaSHI is designed around a pluggable, decoupled solver architecture. You formulate mathematical models using a unified algebraic API, then solve them with the engine best suited for your problem class.

---

## ⚡ Solvers Matrix & Comparison

| Solver | Engine License | Problem Classes | Best For | Status in WaSHI |
| :--- | :--- | :--- | :--- | :--- |
| **[HiGHS](https://github.com/ERGO-Code/HiGHS)** | **MIT** | **LP, MIP, Convex QP** | Industrial-scale optimization, operations research, finance | **Built-in default** (zero configuration) |
| **[Pumpkin](https://github.com/ConSol-Lab/Pumpkin)** | **MIT** | **CP, LCG, Logic, Bounded Integer** | Disjunctive scheduling, CP global constraints, zero-COOP/COEP `unsatCore` | **Bundled plugin** (`@ohtaman/washi/solvers/pumpkin`, zero external deps) |
| **[Z3](https://github.com/Z3Prover/z3)** (via [`z3-solver`](https://www.npmjs.com/package/z3-solver)) | **MIT** | **SMT, SAT, Logic, MIP** | Propositional logic, conflict diagnosis (`unsatCore`), rule engines | Optional peer plugin (`@ohtaman/washi/solvers/z3`, requires `z3-solver`) |
| **[GLPK](https://www.gnu.org/software/glpk/)** (via [`glpk.js`](https://www.npmjs.com/package/glpk.js)) | **GPL-3.0** | **LP, MIP** | Academic benchmarks, legacy GLPK compatibility | Optional peer plugin (`@ohtaman/washi/solvers/glpk`, requires `glpk.js`) |
| **Mock** | **MIT** | *Any* | Ultra-fast unit testing in CI without loading WebAssembly | Built-in |

---

## Selecting a Solver

Specify the solver by name when creating your `Model`:

```typescript
// 1. Built-in HiGHS (default)
const m1 = new Model({ solver: "highs" });

// 2. Pumpkin CP/LCG solver (bundled WASM, zero COOP/COEP)
import "@ohtaman/washi/solvers/pumpkin";
const m2 = new Model({ solver: "pumpkin" });

// 3. Z3 SMT solver
import "@ohtaman/washi/solvers/z3";
const m3 = new Model({ solver: "z3" });

// 4. GLPK solver
import "@ohtaman/washi/solvers/glpk";
const m4 = new Model({ solver: "glpk" });
```

---

## Solver Guides

- [HiGHS Guide](./highs.md): Background Web Worker execution, MIP tolerances, and Convex QP solving.
- [Pumpkin Guide](./pumpkin.md): Bundled LCG constraint programming, background Web Worker execution, CP global constraints, warm starts, and zero-COOP/COEP `unsatCore`.
- [Z3 Guide](./z3.md): SMT assertions, logic modeling, and Unsat Core analysis.
- [GLPK Guide](./glpk.md): GLPK adapter, GPL-3.0 licensing considerations, and browser usage.
- [Custom Solvers](./custom-solver.md): Step-by-step developer tutorial for integrating proprietary or cloud REST solvers.
