---
layout: home

hero:
  name: 'WaS<span class="brand-hi">HI</span>'
  text: "Algebraic Modeler for Mathematical Optimization & Constraint Programming"
  tagline: "A TypeScript alternative to Python's PuLP. Formulate LP, MIP, Convex QP, and SMT models with intuitive infix expressions and solve client-side via WebAssembly (HiGHS, Z3, GLPK) with zero Python or native C++ dependencies."
  image:
    src: /washi-logo.svg
    alt: WaSHI Emblem
  actions:
    - theme: brand
      text: Getting Started
      link: /getting-started/
    - theme: alt
      text: Showcase
      link: /showcase/

features:
  - icon: ✍️
    title: Algebraic Modeling (expr)
    details: Write infix formulas (expr`30 * ${x} + 50 * ${y} <= 40`), vector dot products (dot), and summations (sum) while binding ${...} directly as typed Var references.
    link: /guide/expressions
    linkText: Expressions
  - icon: ⚙️
    title: Pluggable Solver Adapters
    details: Use a common modeling API across the built-in HiGHS engine (LP, MIP, convex QP) and optional adapters for Z3 (SMT, logic, unsat cores) and GLPK.
    link: /solvers/
    linkText: Solvers
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

// 2. Define decision variables with realistic bounds
const desks = m.integer("desks", { lb: 0, ub: 100 });
const chairs = m.integer("chairs", { lb: 0, ub: 100 });

// 3. Set objective function ($30/desk, $50/chair)
m.objective(maximize(expr`30 * ${desks} + 50 * ${chairs}`));

// 4. Add constraints (material and labor limits)
m.constraint(expr`${desks} + 2 * ${chairs} <= 40`, "wood_limit");
m.constraint(expr`2 * ${desks} + ${chairs} <= 50`, "labor_limit");

// 5. Solve via WebAssembly (HiGHS)
await m.solve();

if (m.hasPrimalSolution) {
  console.log(`Produce: ${desks.value} desks, ${chairs.value} chairs`);
  console.log(`Maximum Profit: $${m.objectiveValue}`);
}
```

## Explore Documentation

<div class="tip custom-block" style="padding-top: 8px;">

- **Getting Started**: [Introduction & Installation](./getting-started/) · [AI Coding Agent Quick-Reference](./getting-started/ai-agents) · [Runtime Environments](./getting-started/runtimes) · [Cross-Origin Isolation](./getting-started/cross-origin)
- **Modeling Guide**: [Variables & Bounds](./guide/variables) · [Expressions (expr, dot, sum)](./guide/expressions) · [Objective Functions](./guide/objectives) · [Constraints](./guide/constraints) · [Unsat Core Diagnosis](./guide/unsat-core)
- **Solver Backends**: [HiGHS (Built-in)](./solvers/highs) · [Z3 (SMT)](./solvers/z3) · [GLPK (LP/MIP)](./solvers/glpk) · [Custom Solver Plugins](./solvers/custom-solver)
- **Examples**: [Diet Problem & Sensitivity](./examples/diet-sensitivity) · [Production Planning](./examples/production) · [Knapsack](./examples/knapsack) · [Portfolio QP](./examples/portfolio-qp) · [Shift Scheduling](./examples/shift-scheduling) · [SMT Security](./examples/smt-security)
- **Interactive Showcase**: [Apps & Games Showcase](./showcase/)

</div>

</div>
