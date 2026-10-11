<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/washi-header-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/washi-header-light.png">
    <img alt="WaSHI - Algebraic Modeler for TypeScript &amp; JavaScript" src="./assets/washi-header-light.png" width="420" />
  </picture>
  <p><strong>Intuitive Mathematical Optimization &amp; Algebraic Modeler for TypeScript &amp; JavaScript</strong></p>
  <p>
    <em>Linear Programming (LP) • Mixed-Integer Programming (MIP) • Quadratic Programming (QP) • SMT &amp; Conflict Diagnosis</em>
  </p>
  <p>
    <a href="./README.md">English</a> •
    <a href="./README.ja.md">日本語</a> •
    <a href="./README.zh-CN.md">简体中文</a>
  </p>
  <p>
    <a href="https://www.npmjs.com/package/@ohtaman/washi"><img src="https://img.shields.io/npm/v/@ohtaman/washi?color=crimson&label=npm" alt="npm version" /></a>
    <a href="https://bundlephobia.com/package/@ohtaman/washi"><img src="https://img.shields.io/badge/bundle%20size-7.2%20kB%20(gzip)-blue" alt="bundle size" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
    <img src="https://img.shields.io/badge/types-TypeScript-blue" alt="TypeScript types" />
    <img src="https://img.shields.io/badge/tests-120%2B%20passing-brightgreen" alt="tests" />
  </p>
</div>

---

**WaSHI** is a high-level algebraic modeling library that brings the expressive elegance of Python's **PuLP** and Julia's **JuMP** to the modern TypeScript and JavaScript ecosystem. Formulate mathematical models using natural algebraic equations and solve them instantly across Node.js, browsers, Bun, Deno, and Next.js—powered natively by WebAssembly solvers (**HiGHS**, **Z3**, and **GLPK**) with zero native compilation steps.

```ts
import { Model, expr, c } from "@ohtaman/washi";

const m = new Model({ sense: "Maximize" });
const x = m.addVar({ type: "Integer", lb: 0 });
const y = m.addVar({ type: "Integer", lb: 0 });

m.maximize(expr`30 * ${x} + 50 * ${y}`);
m.addConstraint(c`${x} + 2 * ${y} <= 40`, "wood_limit");
m.addConstraint(c`2 * ${x} + ${y} <= 50`, "labor_limit");

await m.solve();
console.log(`Produce: x=${x.value}, y=${y.value} (Profit: $${m.objectiveValue})`);
```

---

## 🎯 Why WaSHI?

1. 🌐 **100% Client-Side & Zero Server Cost**: Run industrial-grade optimization entirely inside the user's browser, edge worker, or Electron app. Zero backend server costs, offline-ready, and 100% private (confidential business data never leaves the client device).
2. 📦 **Frictionless Zero-Dependency Distribution**: No Python runtimes, no C/C++ compilation, and no OS-dependent native solver binaries to bundle. Just `npm install @ohtaman/washi`—everything (including WebAssembly solvers) works instantly out of the box.
3. ✍️ **Familiar Algebraic Modeling (PuLP & python-mip DX)**: Never struggle with low-level matrix indices. Formulate models naturally using tagged template literals (`c`${x} + 2 * ${y} <= 40``) or drop-in PuLP/python-mip syntax (`LpProblem`, `lpSum`).
4. 🔄 **Pluggable Solvers & Unified API**: Formulate your mathematical model once; solve with **HiGHS** (industrial MIP/QP), **Z3** (SMT logic & Unsat Core diagnosis), or **GLPK** with a single parameter.
5. 🔍 **Automatic Conflict Diagnosis (`unsatCore`)**: When constraints are contradictory (Infeasible), diagnose root causes instantly by extracting the minimal conflicting constraint subset via the Z3 engine.
6. ⚡ **Industrial Scale Performance in WebAssembly**: Built with an $O(N)$ linear-time expression builder. Formulate 20,000+ variable MIPs in ~100ms and solve them in ~15 seconds right inside WebAssembly via HiGHS.

---

## ⚡ Solvers Matrix

| Solver | Engine License | Problem Classes | Best For | Status in WaSHI |
| :--- | :--- | :--- | :--- | :--- |
| **HiGHS** | **MIT** | **LP, MIP, Convex QP** | Industrial-scale optimization, production planning, finance | **Built-in default** (zero-config) |
| **Z3** | **MIT** | **SMT, SAT, Logic, MIP** | Propositional logic, conflict diagnosis (`unsatCore`), rule engines | Optional plugin (`@ohtaman/washi/solvers/z3`) |
| **GLPK** | **GPL-3.0** | **LP, MIP** | Academic benchmarks, legacy GLPK compatibility | Optional plugin (`@ohtaman/washi/solvers/glpk`) |
| **Mock** | **MIT** | *Any* | Ultra-fast unit testing in CI without loading WebAssembly | Built-in |

---

## 📦 Installation

```bash
# npm
npm install @ohtaman/washi

# pnpm
pnpm add @ohtaman/washi

# yarn
yarn add @ohtaman/washi

# bun
bun add @ohtaman/washi
```

*(Optional)* To use Z3 or GLPK solvers, install their respective packages:

```bash
npm install z3-solver    # For SMT and unsat core diagnosis
npm install glpk.js      # For GLPK solver (GPL-3.0)
```

---

## 🚀 Usage Guide

### 1. Mixed-Integer Linear Programming (MIP)

Formulate production scheduling, resource allocation, and facility location problems:

```ts
import { Model, c, expr } from "@ohtaman/washi";

const m = new Model({ name: "FactoryPlanning", sense: "Maximize" });

// Decision variables (Integer, non-negative)
const chairs = m.addVar({ name: "chairs", type: "Integer", lb: 0 });
const tables = m.addVar({ name: "tables", type: "Integer", lb: 0 });

// Natural formula objective & constraints via Tagged Template Literals
m.maximize(expr`30 * ${chairs} + 50 * ${tables}`);
m.addConstraint(c`${chairs} + 2 * ${tables} <= 40`, "wood_limit");
m.addConstraint(c`2 * ${chairs} + ${tables} <= 50`, "labor_limit");

// Solve using default HiGHS WASM engine
const status = await m.solve();

console.log(`Status: ${status}`); // "Optimal"
console.log(`Objective: $${m.objectiveValue}`); // 1100
console.log(`Chairs: ${chairs.value}, Tables: ${tables.value}`); // 20 chairs, 10 tables
```

#### 🗂 Multidimensional Variables Grid (`addVars`)

Construct variable arrays or multi-index matrices in one line (similar to PuLP's `LpVariable.dicts`):

```ts
// 1D dictionary of binary variables
const openCity = m.addVars(["Tokyo", "Osaka", "Nagoya"], { type: "Binary" });

// 2D transport flow matrix: [Factory] x [Store]
const flow = m.addVars(["F1", "F2"], ["StoreA", "StoreB"], { lb: 0 });

// 2D coordinate grid (e.g. 8x8 chessboard)
const board = m.addVars(8, 8, { type: "Binary", prefix: "queen" });
```

#### 🔀 Big-M Indicator Constraints (`addIndicator`)

Model conditional activation rules and fixed-charge economics without manual Big-M algebra:

```ts
// If factory is closed (openCity['Tokyo'] == 0), its production capacity must be 0
m.addIndicator(openCity["Tokyo"], flow["F1"]["StoreA"].le(0), {
  activeValue: 0,
  M: 1000,
});
```

---

### 2. Portfolio Risk Minimization (Convex Quadratic Programming)

Minimize investment risk based on a covariance matrix subject to return and budget constraints:

```ts
import { Model, QuadExpr, sum } from "@ohtaman/washi";

const m = new Model({ name: "MarkowitzPortfolio", sense: "Minimize" });
const assets = ["Tech", "Bonds", "RealEstate"];
const returns = [0.14, 0.04, 0.08];

// Decision variables: portfolio allocation weights (0 to 1)
const w = assets.map((a) => m.addVar({ name: `w_${a}`, lb: 0, ub: 1 }));

// 1. Fully invested budget: sum(w) == 1.0
m.addConstraint(sum(w).eq(1.0), "budget");

// 2. Minimum target return: portfolio return >= 8.5%
m.addConstraint(sum(w.map((v, i) => v.mul(returns[i]))).ge(0.085), "min_return");

// 3. Covariance risk matrix
const cov = [
  [0.040, 0.002, 0.015],
  [0.002, 0.005, 0.002],
  [0.015, 0.002, 0.025],
];

// Quadratic objective: w^T * Cov * w
let risk = new QuadExpr();
for (let i = 0; i < assets.length; i++) {
  for (let j = 0; j < assets.length; j++) {
    risk = risk.add(w[i].mul(w[j]).mul(cov[i][j]));
  }
}
m.minimize(risk);

await m.solve();
console.log(`Minimal Variance: ${m.objectiveValue?.toFixed(6)}`);
assets.forEach((name, i) => {
  console.log(`  ${name}: ${((w[i].value || 0) * 100).toFixed(2)}%`);
});
```

---

### 3. SMT Logic & Rule Engines (with Z3)

Express boolean variables, propositional connectives (`and`, `or`, `implies`, `not`, `xor`), and mixed arithmetic rules:

```ts
import { Model, not } from "@ohtaman/washi";

const m = new Model({ name: "SmartSecurityRules" });

const isNight = m.addBoolVar("isNight");
const motion = m.addBoolVar("motion");
const alarm = m.addBoolVar("alarm");
const siren = m.addBoolVar("siren");
const lux = m.addVar({ name: "lux", type: "Integer", lb: 0 });

// Logical rules
m.addConstraint(lux.le(50).implies(isNight), "dark_implies_night");
m.addConstraint(motion.and(isNight).and(alarm).implies(siren), "alarm_rule");

// Current sensor observations
m.addConstraint(lux.le(10), "sensor_dark");
m.addConstraint(motion, "sensor_motion");
m.addConstraint(alarm, "alarm_on");

// Check satisfiability and deduce state without an objective function
const res = await m.check({ solver: "z3" });

console.log(`Satisfiable? ${res.status === "Sat"}`); // true
console.log(`Siren active? ${m.values.get("siren")}`); // true
```

---

### 4. Conflict Diagnosis (`unsatCore`)

When business rules or constraints contradict each other, extract the **minimal conflicting subset** for instant troubleshooting (requires Z3):

```ts
import { Model } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });
const engineers = m.addVar({ name: "engineers", type: "Integer", lb: 0, ub: 20 });
const budget = m.addVar({ name: "budget", type: "Continuous", lb: 0, ub: 100000 });
const rushDelivery = m.addBoolVar("rushDelivery");

// Rule 1: Each engineer costs $8,000
m.addConstraint(engineers.mul(8000).le(budget), "budget_limit");

// Rule 2: Customer requires rush delivery
m.addConstraint(rushDelivery, "rush_required");

// Rule 3: Rush delivery requires at least 8 engineers
m.addConstraint(rushDelivery.implies(engineers.ge(8)), "rush_staffing_rule");

// Rule 4: Hard board budget cap of $50,000 (Conflict: 8 * $8000 = $64,000 > $50,000!)
m.addConstraint(budget.le(50000), "strict_board_budget_cap");

// Rule 5: Innocent bystander rule
m.addConstraint(engineers.ge(1), "minimum_one_employee");

const res = await m.check({ solver: "z3" });

console.log(`Status: ${res.status}`); // "Unsat"
console.log("Conflicting constraints:", res.unsatCore);
// Output: ["budget_limit", "rush_required", "rush_staffing_rule", "strict_board_budget_cap"]
// Note: "minimum_one_employee" is correctly excluded!
```

---

### 5. Python PuLP Compatibility Layer

If you have existing Python PuLP code, port it with near zero friction:

```ts
import {
  LpProblem,
  LpVariable,
  LpMaximize,
  LpInteger,
  HiGHS,
  value,
} from "@ohtaman/washi";

const prob = new LpProblem("PuLPDemo", LpMaximize);

const x = new LpVariable("x", 0, undefined, LpInteger);
const y = new LpVariable("y", 0, undefined, LpInteger);

// PuLP += equivalent
prob.add(x.mul(30).add(y.mul(50)));
prob.add(x.add(y.mul(2)).le(40));
prob.add(x.mul(2).add(y).le(50));

await prob.solve(new HiGHS());

console.log(`Status: ${prob.status}`);
console.log(`Objective: ${value(prob.objective)}`);
console.log(`x = ${value(x)}, y = ${value(y)}`);
```

---

## 💻 CLI & Interactive Demos

Ready-to-run standalone examples are available in `examples/node/`:

```bash
npx tsx examples/node/01-production-planning.ts
npx tsx examples/node/02-knapsack-problem.ts
npx tsx examples/node/03-portfolio-qp.ts
npx tsx examples/node/04-smt-security-rules.ts
npx tsx examples/node/05-unsat-core-diagnosis.ts
npx tsx examples/node/06-pulp-compatibility.ts
```

To run the interactive browser showcase (`examples/web-demo`):

```bash
npm run dev
# Open http://localhost:5173/ in your browser
```

---

## 🧪 Testing

WaSHI is developed with strict Test-Driven Development (TDD) across 120+ unit, integration, and large-scale test cases:

```bash
# Run all unit and integration tests
npm test

# Build production bundle and TypeScript declarations
npm run build
```

---

## 📄 License

- **`@ohtaman/washi`**: [MIT License](./LICENSE)
- **HiGHS** (default engine): MIT License
- **Z3** (optional plugin): MIT License
- **GLPK** (optional plugin): GPL-3.0 License
