---
layout: home

hero:
  name: 'WaS<span class="brand-hi">HI</span>'
  text: "Mathematical Optimization Modeler for TypeScript"
  tagline: WebAssembly-backed, Solver-independent, High-level modeling Interface (LP, MIP, QP, SMT). Native mathematical optimization for TypeScript with high-performance WebAssembly solvers.
  image:
    src: /washi-logo.svg
    alt: WaSHI Emblem
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/
    - theme: alt
      text: Live Playground ↗
      link: https://ohtaman.github.io/washi/demo/
    - theme: alt
      text: GitHub
      link: https://github.com/ohtaman/washi

features:
  - icon: 🌐
    title: 100% Client-Side & Zero Server Cost
    details: Solve industrial optimization problems entirely inside WebAssembly. Private, offline-ready, with zero backend infrastructure expenses.
  - icon: ✍️
    title: Intuitive Algebraic Modeling
    details: Domain-pure variables (m.binary, m.integer, m.continuous), formula templates (expr`...`), vector aggregations (dot, sum), and first-class constraints (m.constraint).
  - icon: ⚡
    title: Industrial Multi-Solver Architecture
    details: Built-in default HiGHS solver (LP/MIP/QP) with pluggable adapters for Z3 (SMT logic & conflict diagnosis) and GLPK.
  - icon: 🔍
    title: Automatic Infeasibility Diagnosis
    details: When constraints conflict, diagnose root causes effortlessly by extracting an Unsatisfiable Core (unsatCore) using the Z3 engine.
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
