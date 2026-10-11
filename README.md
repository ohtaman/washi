<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/washi-header-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/washi-header-light.png">
    <img alt="WaSHI - Algebraic Modeler for TypeScript &amp; JavaScript" src="./assets/washi-header-light.png" width="420" />
  </picture>
  <p><strong>Mathematical Optimization Modeler &amp; Algebraic System for TypeScript &amp; JavaScript</strong></p>
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
    <a href="https://github.com/ohtaman/washi/actions/workflows/distribution.yml"><img src="https://github.com/ohtaman/washi/actions/workflows/distribution.yml/badge.svg" alt="CI Status" /></a>
    <a href="https://ohtaman.github.io/washi/"><img src="https://img.shields.io/badge/docs-online-blue" alt="docs" /></a>
    <a href="https://ohtaman.github.io/washi/demo/"><img src="https://img.shields.io/badge/demo-playground-brightgreen" alt="live demo" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
  </p>
</div>

---

**WaSHI** is a high-level mathematical optimization modeler and algebraic modeling system that brings the expressive elegance of Python's **PuLP** and Julia's **JuMP** to the modern TypeScript and JavaScript ecosystem. Formulate mathematical models using natural algebraic equations and solve them instantly across Node.js, browsers, Bun, Deno, and Next.js—powered natively by WebAssembly solvers (**HiGHS**, **Z3**, and **GLPK**) with zero native compilation steps.

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
5. 🔍 **Automatic Conflict Diagnosis (`unsatCore`)**: When constraints are contradictory (Infeasible), diagnose root causes by extracting a conflicting constraint subset (unsatisfiable core) via the Z3 engine.
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
import "@ohtaman/washi/solvers/z3";

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

When business rules or constraints contradict each other, extract a **conflicting constraint subset** (unsatisfiable core; minimality is not guaranteed) for troubleshooting (requires Z3):

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

### 5. Solving with GLPK (GPL-3.0)

To use the GNU Linear Programming Kit (GLPK) solver plugin:

```ts
import { Model, expr, c } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/glpk";

const m = new Model({ sense: "Maximize", solver: "glpk" });
const x = m.addVar({ type: "Integer", lb: 0 });
const y = m.addVar({ type: "Integer", lb: 0 });

m.maximize(expr`30 * ${x} + 50 * ${y}`);
m.addConstraint(c`${x} + 2 * ${y} <= 40`, "wood_limit");
m.addConstraint(c`2 * ${x} + ${y} <= 50`, "labor_limit");

const status = await m.solve();
console.log(`Status: ${status}`); // "Optimal"
console.log(`Objective: ${m.objectiveValue}`); // 1100
```

---

### 6. Python PuLP Compatibility Layer

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

## 🌐 Browser & Web Worker Usage

The default HiGHS engine uses the package's WASM asset. There is **no automatic CDN fallback**. Node.js uses the installed HiGHS runtime; Vite and webpack 5 can discover the package-relative WASM and Worker references when building a browser application.

### npm with a bundler

```typescript
import { Model } from "@ohtaman/washi";
const model = new Model();
// Define variables, objective and constraints.
await model.solve();
```

No manual WASM copy or URL configuration is needed in the tested Vite / webpack builds. Other bundlers and SSR need their own integration checks; call the browser solver on the client. Worker execution is the browser default. Use `model.solve({ useWorker: false })` for a simple main-thread demo; a long solve will block the UI.

### Browser ESM without an application build

Serve the **entire `dist/browser` directory**, including its JS chunks, `highs.wasm` and Worker. No import map is needed:

```html
<script type="module">
  import { Model } from "./washi/washi.js";
  const model = new Model();
  // Define variables, objective and constraints.
  await model.solve({ useWorker: false });
</script>
```

### Plain script / CodePen

The package also includes `dist/browser/washi.min.js`, which exports the `Washi` global. Put that file's URL in CodePen's External Scripts, or use a script tag:

```html
<script src="./washi/washi.min.js"></script>
<script>
  const model = new Washi.Model();
  // Define variables, objective and constraints.
  model.solve({ useWorker: false }).then(status => console.log(status));
</script>
```

For CDN usage, replace the local URL with `https://cdn.jsdelivr.net/npm/@ohtaman/washi@0.1.2/dist/browser/washi.min.js` (or pin your desired release version `>= 0.1.2`). For ESM use the corresponding `dist/browser/washi.js` URL. Selecting the CDN URL is an explicit choice; local copies never switch to a CDN.

### Solver Plugins in the Browser (GLPK & Z3)

The browser distribution includes pre-bundled, standalone solver plugins under `dist/browser/solvers/` (available from `>= 0.2.0` or `@latest` on CDN):
- **GLPK**: `dist/browser/solvers/glpk.js` (ESM) and `dist/browser/solvers/glpk.min.js` (IIFE, registers global `WashiGLPK`)
- **Z3**: `dist/browser/solvers/z3.js` (ESM) and `dist/browser/solvers/z3.min.js` (IIFE, registers global `WashiZ3`), accompanied by `z3-built.js` and `z3-built.wasm`

#### Browser ESM with GLPK
```html
<script type="module">
  import { Model } from "./washi/washi.js";
  import "./washi/solvers/glpk.js";

  const model = new Model({ solver: "glpk" });
  const x = model.addVar({ lb: 0, ub: 10 });
  model.maximize(x);
  await model.solve();
  console.log("GLPK status:", model.status);
</script>
```

#### Plain Script with GLPK
```html
<script src="./washi/washi.min.js"></script>
<script src="./washi/solvers/glpk.min.js"></script>
<script>
  const model = new Washi.Model({ solver: "glpk" });
  const x = model.addVar({ lb: 0, ub: 10 });
  model.maximize(x);
  model.solve().then(status => console.log("GLPK status:", status));
</script>
```

> [!NOTE]
> **Z3 in Browser Environments**:
> Because the Z3 WebAssembly engine uses multithreading (`SharedArrayBuffer`), the hosting web server must send Cross-Origin-Isolation delivery headers on the document response:
> ```http
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```
> And any cross-origin assets (e.g. from a CDN) must serve `Cross-Origin-Resource-Policy: cross-origin`.

Complete standalone examples for ESM, script tags, and CodePen are available in `examples/distribution/`.

### Offline distribution, Workers and custom hosting

Deploy the full application build or the entire browser distribution to a local HTTP / intranet server. With all assets locally available, an empty browser cache does not require access to the internet. Saving only the HTML or the first JS file is insufficient. `file://` execution and automatic PWA caching are not supported by this distribution.

ESM assets resolve relative to their module URL; the script build captures its own script URL at load time. CDN Workers use a Blob module bootstrap. The server must permit cross-origin JS / WASM loading; CSP must permit the selected script / connection origins and `worker-src blob:` for CDN Workers. If that is unavailable, use `useWorker: false`. Worker load / message failures reject pending solves rather than leaving them unresolved.

For custom hosting, `setHighsWasmUrl(url)` and `options.wasmUrl` remain available. To explicitly use the existing HiGHS CDN:

```typescript
import { setHighsWasmUrl, OFFICIAL_HIGHS_CDN_WASM_URL } from "@ohtaman/washi";
setHighsWasmUrl(OFFICIAL_HIGHS_CDN_WASM_URL);
```

Failed initialization reports the attempted URL and does not try a different host. This changes the previous local-root/CDN fallback behavior: deploy the generated assets or configure an explicit URL.

### Verify the distributable

`npm run test:distribution` packs and installs the actual npm tarball, builds Vite / webpack consumers without optional peers, and runs their emitted JS with real WASM in a VM. This is not a browser/CORS test. For Playwright Chromium checks, run `npx playwright install chromium` and `RUN_DISTRIBUTION_BROWSER=1 npm run test:distribution`. CI also runs that browser mode, including separate-origin browser bundles with external network requests blocked.

---

## 🛠️ Custom Solvers & Extensibility

WaSHI features a decoupled, pluggable solver architecture. You can easily build and register your own custom solver adapter (e.g., for cloud REST optimizers, WebAssembly engines, or proprietary solvers):

- See the complete [Custom Solver Developer Guide](docs/custom-solver-guide.md) for step-by-step tutorials, complete API contracts (`Solver`, `LpModelData`, `SolverResult`), and testing best practices.

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
npx tsx examples/node/08-glpk-solver-plugin.ts
```

To run the interactive browser showcase (`examples/web-demo`):

```bash
npm run dev
# Documentation: http://localhost:5173/
# Interactive Demo: http://localhost:5173/demo/
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
