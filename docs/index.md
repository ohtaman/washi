---
layout: home

hero:
  text: "Mathematical Optimization Modeler in TypeScript"
  tagline: "A TypeScript alternative to Python's PuLP. Formulate LP, MIP, Convex QP, CP, and SMT models with intuitive infix expressions and solve in Node.js and browsers via WebAssembly (HiGHS, Pumpkin, Z3, GLPK) with zero Python or native C++ dependencies."
  actions:
    - theme: brand
      text: Getting Started
      link: /getting-started/
    - theme: alt
      text: Optimization N
      link: /exercises/
    - theme: alt
      text: Showcase
      link: /showcase/

features:
  - icon: 🌐
    title: WebAssembly & Zero Native Setup
    details: No Python runtime or native C/C++ builds required. Run optimization models directly in Node.js, browsers, and Web Workers.
    link: /getting-started/runtimes
    linkText: Runtime Environments
  - icon: ✍️
    title: Algebraic Modeling (expr)
    details: Write LP, MIP, Convex QP, CP, and SMT models using natural infix math expressions instead of hand-assembling matrices or LP text.
    link: /guide/expressions
    linkText: Modeling Expressions
  - icon: 🧩
    title: Type-Safe Modeling in TypeScript
    details: Bind decision variables directly to your application's data types to catch key typos, index mismatches, and type mix-ups at compile time.
    link: /guide/variables
    linkText: Variables & Domains
  - icon: 🔍
    title: Infeasibility & Conflict Diagnosis
    details: When constraints conflict and no feasible solution exists, pinpoint which rules contradict each other using bundled HiGHS or Pumpkin, or optional Z3.
    link: /guide/unsat-core
    linkText: Conflict Diagnosis
  - icon: ⚙️
    title: Pluggable Solver Backends
    details: Formulate once and switch seamlessly between bundled HiGHS (LP/MIP/QP) and Pumpkin (CP/LCG), optional Z3 and GLPK plugins, or your own custom solver.
    link: /solvers/
    linkText: Solver Backends
  - icon: 🔀
    title: Large-Scale Decomposition
    details: Built-in support for Column Generation, Benders Decomposition, LP relaxations, and dual values (shadow prices) for large-scale problems.
    link: /guide/decomposition
    linkText: Decomposition Methods
---

<div class="washi-home-sections">

<div class="washi-home-showcase">
<div class="washi-home-showcase-head">
<h2>Built with WaSHI</h2>
<a href="/showcase/" class="washi-home-all-link">View All Showcase →</a>
</div>
<p class="washi-home-showcase-sub">
Decision-support apps and optimization puzzles running locally in the browser via WebAssembly, with zero server round-trips.
</p>
<div class="washi-home-showcase-grid">
<div class="washi-showcase-card">
<div class="washi-showcase-thumb">
<img src="/showcase/thumb-ai-timetable.png" alt="" width="960" height="540" class="washi-showcase-thumb-img" loading="lazy" />
</div>
<div class="washi-showcase-card-body">
<div>
<div class="washi-showcase-card-top">
<span class="washi-showcase-icon" aria-hidden="true">🎓</span>
<span class="washi-showcase-badge">Gemini Nano × HiGHS MILP</span>
</div>
<div class="washi-showcase-title">
<a href="/apps/ai-timetable/" target="_self" class="washi-showcase-title-link">AI University Timetabling Copilot</a>
</div>
<p class="washi-showcase-desc">
Coordinate 4 student cohorts, 10 faculty schedules, and 7 specialized rooms simultaneously from CSV data or natural-language rules.
</p>
</div>
<span class="washi-home-card-cta" aria-hidden="true">Open App →</span>
</div>
</div>
<div class="washi-showcase-card">
<div class="washi-showcase-thumb">
<img src="/showcase/thumb-titan-pack.png" alt="" width="640" height="360" class="washi-showcase-thumb-img" loading="lazy" />
</div>
<div class="washi-showcase-card-body">
<div>
<div class="washi-showcase-card-top">
<span class="washi-showcase-icon" aria-hidden="true">⚡</span>
<span class="washi-showcase-badge">2D Strip Packing MILP</span>
</div>
<div class="washi-showcase-title">
<a href="/games/titan-pack/" target="_self" class="washi-showcase-title-link">TITAN PACK</a>
</div>
<p class="washi-showcase-desc">
2D sheet-metal cutting puzzle powered by live MILP solving—pack parts with zero scrap void and zero guillotine fault lines.
</p>
</div>
<span class="washi-home-card-cta" aria-hidden="true">Play Game →</span>
</div>
</div>
<div class="washi-showcase-card">
<div class="washi-showcase-thumb">
<img src="/showcase/thumb-mofumofu-sheep.png" alt="" width="960" height="540" class="washi-showcase-thumb-img" loading="lazy" />
</div>
<div class="washi-showcase-card-body">
<div>
<div class="washi-showcase-card-top">
<span class="washi-showcase-icon" aria-hidden="true">🐑</span>
<span class="washi-showcase-badge">Network Cut &amp; Enclosure MILP</span>
</div>
<div class="washi-showcase-title">
<a href="/games/mofumofu-sheep/" target="_self" class="washi-showcase-title-link">Fluffy Sheep Pasture Enclosure</a>
</div>
<p class="washi-showcase-desc">
Block wolf entry paths with limited wooden fences while maximizing safe pasture rewards using exact graph-cut optimization.
</p>
</div>
<span class="washi-home-card-cta" aria-hidden="true">Play Game →</span>
</div>
</div>
</div>
</div>

<div class="washi-home-docs-dir">

## Explore Documentation

<div class="tip custom-block" style="padding-top: 8px;">

- **Getting Started**: [Introduction & Installation](/getting-started/) · [Coding with AI Agents](/getting-started/coding-agents) · [Runtime Environments](/getting-started/runtimes) · [Cross-Origin Isolation](/getting-started/cross-origin)
- **Modeling Guide**: [Variables & Bounds](/guide/variables) · [Expressions (expr, dot, sum)](/guide/expressions) · [Constraints](/guide/constraints) · [Objective Functions](/guide/objectives) · [Diagnosis, Validation & Debugging](/guide/unsat-core) · [Constraint Programming (CP)](/guide/constraint-programming) · [Decomposition Methods](/guide/decomposition) · [Formulation Patterns & Tips](/guide/formulation-tips)
- **Solver Backends**: [Overview & Comparison](/solvers/) · [HiGHS (Built-in)](/solvers/highs) · [Pumpkin (CP/LCG)](/solvers/pumpkin) · [Z3 (SMT)](/solvers/z3) · [GLPK (LP/MIP)](/solvers/glpk) · [Custom Solver Adapter](/solvers/custom-solver)
- **Examples**: [Overview & API Finder](/examples/) · [Production Planning](/examples/production) · [0-1 Knapsack](/examples/knapsack) · [Transportation Network](/examples/transportation) · [Diet Problem & Sensitivity](/examples/diet-sensitivity) · [Shift Scheduling](/examples/shift-scheduling) · [E-Commerce Coupon Optimizer](/examples/ecommerce-coupons) · [Portfolio QP](/examples/portfolio-qp) · [Project Scheduling (CP)](/examples/project-scheduling) · [SMT Security](/examples/smt-security) · [Conflict Diagnosis](/examples/unsat-core) · [Vehicle Routing](/examples/vehicle-routing) · [Traveling Salesperson](/examples/traveling-salesperson)
- **Interactive Playground & Showcase**: [Showcase Hub](/showcase/) · <a href="/demo/" target="_self">WaSHI Playground</a> · <a href="/exercises/" target="_self">Optimization N</a> · <a href="/apps/ai-shift/" target="_self">AI Nurse Shift Copilot</a> · <a href="/apps/ai-timetable/" target="_self">AI University Timetabling Copilot</a> · <a href="/games/demon-castle-shift/" target="_self">Demon Castle 24-Hour Guard Shift</a> · <a href="/games/mofumofu-sheep/" target="_self">Fluffy Sheep Pasture Enclosure</a> · <a href="/games/titan-pack/" target="_self">TITAN PACK</a>

</div>

</div>

</div>
