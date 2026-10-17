---
layout: home

hero:
  name: 'WaS<span class="brand-hi">HI</span>'
  text: "Algebraic Modeler for TypeScript & JavaScript"
  tagline: WebAssembly-backed, Solver-independent, High-level modeling Interface for LP, MIP, Convex QP, and SMT. Formulate models in TypeScript and solve locally with HiGHS, Z3, and GLPK.
  image:
    src: /washi-logo.svg
    alt: WaSHI Emblem
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/
    - theme: alt
      text: Documentation
      link: /guide/variables
    - theme: alt
      text: Live Playground ↗
      link: https://ohtaman.github.io/washi/demo/

features:
  - icon: ✍️
    title: Algebraic Modeling (expr)
    details: Write infix formulas (expr`30 * ${x} + 50 * ${y} <= 40`), vector dot products (dot), and summations (sum) while binding ${...} directly as typed Var references.
    link: /guide/expressions
    linkText: Expressions Guide
  - icon: ⚙️
    title: Pluggable Solver Adapters
    details: Use a common modeling API across the built-in HiGHS engine (LP, MIP, convex QP) and optional adapters for Z3 (SMT, logic, unsat cores) and GLPK.
    link: /solvers/
    linkText: Solvers Matrix
  - icon: 🌐
    title: WebAssembly & Local Execution
    details: Solve in Node.js, Bun, Deno, or browser Web Workers without Python services or native C/C++ builds—deployable as static assets and composable with in-browser LLMs.
    link: /getting-started/runtimes
    linkText: Runtime Environments
  - icon: 🔍
    title: Conflict Diagnosis (unsatCore)
    details: Name constraints and inspect conflicting constraint subsets (unsatCore) with the Z3 adapter to debug infeasible formulations.
    link: /guide/unsat-core
    linkText: Unsat Core Diagnosis
---

<div style="max-width: 800px; margin: 40px auto;">

## Quick Example

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

// 1. Create a model
const m = new Model("WoodworkingProfit");

// 2. Define decision variables
const desks = m.integer("desks", { lb: 0 });
const chairs = m.integer("chairs", { lb: 0 });

// 3. Set objective function ($30/desk, $50/chair)
m.objective(maximize(expr`30 * ${desks} + 50 * ${chairs}`));

// 4. Add constraints (material and labor limits)
m.constraint(expr`${desks} + 2 * ${chairs} <= 40`, "wood_limit");
m.constraint(expr`2 * ${desks} + ${chairs} <= 50`, "labor_limit");

// 5. Solve via WebAssembly (HiGHS)
await m.solve();

console.log(`Produce: ${desks.value} desks, ${chairs.value} chairs`);
console.log(`Maximum Profit: $${m.objectiveValue}`);
```

</div>
