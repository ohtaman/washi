---
layout: home

hero:
  text: "Mathematical Optimization Modeler in TypeScript"
  tagline: "A TypeScript alternative to Python's PuLP. Formulate LP, MIP, Convex QP, and SMT models with intuitive infix expressions and solve in Node.js and browsers via WebAssembly (HiGHS, Z3, GLPK) with zero Python or native C++ dependencies."
  actions:
    - theme: brand
      text: Getting Started
      link: /getting-started/
    - theme: alt
      text: Showcase
      link: /showcase/

features:
  - icon: 📅
    title: Scheduling, Routing & Packing
    details: Solve staff rosters, university timetables, 2D packing, and vehicle routing problems out of the box with built-in HiGHS (LP / MIP).
    link: /examples/
    linkText: Practical Examples
  - icon: 📈
    title: Portfolio & Resource Allocation
    details: Minimize portfolio variance risk (Markowitz QP) or fit continuous targets directly with convex quadratic objectives (QuadExpr).
    link: /examples/portfolio-qp
    linkText: Portfolio QP
  - icon: 🔍
    title: Logic Rules & Conflict Diagnosis
    details: When a schedule or policy has no feasible solution, pinpoint conflicting rules via built-in HiGHS elastic relaxation or exact Z3 unsat cores (unsatCore).
    link: /guide/unsat-core
    linkText: Unsat Core Diagnosis
  - icon: 🌐
    title: Browser-Native & Serverless
    details: Runs locally in browser Web Workers and Node.js with zero Python backend—pairs naturally with on-device LLMs as a mathematical guardrail.
    link: /getting-started/runtimes
    linkText: Runtime Environments
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

- **Getting Started**: [Introduction & Installation](/getting-started/) · [Runtime Environments](/getting-started/runtimes) · [Cross-Origin Isolation](/getting-started/cross-origin) · [AI Coding Agent Quick-Reference](/getting-started/ai-agents)
- **Modeling Guide**: [Variables & Bounds](/guide/variables) · [Expressions (expr, dot, sum)](/guide/expressions) · [Objective Functions](/guide/objectives) · [Constraints](/guide/constraints) · [Unsat Core Diagnosis](/guide/unsat-core) · [Decomposition Methods](/guide/decomposition) · [Formulation Patterns & Tips](/guide/formulation-tips)
- **Solver Backends**: [Overview & Comparison](/solvers/) · [HiGHS (Built-in)](/solvers/highs) · [Z3 (SMT)](/solvers/z3) · [GLPK (LP/MIP)](/solvers/glpk) · [Custom Solver Adapter](/solvers/custom-solver)
- **Examples**: [Overview & API Finder](/examples/) · [Production Planning](/examples/production) · [0-1 Knapsack](/examples/knapsack) · [Transportation Network](/examples/transportation) · [Diet Problem & Sensitivity](/examples/diet-sensitivity) · [Shift Scheduling](/examples/shift-scheduling) · [E-Commerce Coupon Optimizer](/examples/ecommerce-coupons) · [Portfolio QP](/examples/portfolio-qp) · [SMT Security](/examples/smt-security) · [Conflict Diagnosis](/examples/unsat-core) · [Vehicle Routing](/examples/vehicle-routing) · [Traveling Salesperson](/examples/traveling-salesperson)
- **Interactive Playground & Showcase**: [Showcase Hub](/showcase/) · <a href="/demo/" target="_self">WaSHI Playground</a> · <a href="/apps/ai-shift/" target="_self">AI Nurse Shift Copilot</a> · <a href="/apps/ai-timetable/" target="_self">AI University Timetabling Copilot</a> · <a href="/games/demon-castle-shift/" target="_self">Demon Castle 24-Hour Guard Shift</a> · <a href="/games/mofumofu-sheep/" target="_self">Fluffy Sheep Pasture Enclosure</a> · <a href="/games/titan-pack/" target="_self">TITAN PACK</a>

</div>

</div>

</div>
