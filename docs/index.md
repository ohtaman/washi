---
layout: home

hero:
  name: 'WaS<span class="brand-hi">HI</span>'
  text: "Mathematical Optimization Modeler for TypeScript"
  tagline: WebAssembly Algebraic System for Hybrid & Integer modeling (LP, MIP, QP, SMT). Bring the modeling DX of PuLP and JuMP to TypeScript with native WebAssembly solvers.
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
    details: Bring the DX of Python's PuLP & JuMP to TypeScript. Formulate models naturally with tagged template literals (expr`...`, c`...`) or drop-in PuLP syntax.
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
import { Model, expr, c } from "@ohtaman/washi";

// 1. Create a model
const m = new Model({ sense: "Maximize" });

// 2. Define decision variables
const x = m.addVar({ type: "Integer", lb: 0, name: "desks" });
const y = m.addVar({ type: "Integer", lb: 0, name: "chairs" });

// 3. Set objective function ($30/desk, $50/chair)
m.maximize(expr`30 * ${x} + 50 * ${y}`);

// 4. Add constraints (material and labor limits)
m.addConstraint(c`${x} + 2 * ${y} <= 40`, "wood_limit");
m.addConstraint(c`2 * ${x} + ${y} <= 50`, "labor_limit");

// 5. Solve via WebAssembly (HiGHS)
await m.solve();

console.log(`Produce: ${x.value} desks, ${y.value} chairs`);
console.log(`Maximum Profit: $${m.objectiveValue}`);
```

</div>
