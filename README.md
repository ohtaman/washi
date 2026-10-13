<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/washi-header-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/washi-header-light.png">
    <img alt="WaSHI - Algebraic Modeler for TypeScript &amp; JavaScript" src="./assets/washi-header-light.png" width="420" />
  </picture>
  <p><strong>Algebraic Modeling for TypeScript &amp; JavaScript</strong></p>
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

**WaSHI** (WebAssembly-backed, Solver-independent, High-level modeling Interface) is an algebraic modeler for TypeScript and JavaScript, inspired by Python's **PuLP** and Julia's **JuMP**. Define variables, objectives, and arithmetic or logical constraints in application code. WaSHI constructs the model, translates it for a solver adapter, and maps results back to your variables. **HiGHS**, **Z3**, and **GLPK** perform the optimization or satisfiability checks.

HiGHS is the default solver; Z3 and GLPK are optional plugins. The package provides Node.js and browser distributions, including WebAssembly assets. See the [browser integration guide](#-browser--web-worker-usage) for deployment requirements.

[Try the browser demo](https://ohtaman.github.io/washi/demo/) · [Browse example source code](https://github.com/ohtaman/washi/blob/main/examples/README.md) · [ESM / script / CodePen examples](https://github.com/ohtaman/washi/blob/main/examples/distribution/README.md)

```ts
import { Model, expr, c, maximize } from "@ohtaman/washi";

const m = new Model("WoodworkingProfit");
const x = m.integer("desks", { lb: 0 });
const y = m.integer("chairs", { lb: 0 });

m.objective(maximize(expr`30 * ${x} + 50 * ${y}`));
m.constraint(c`${x} + 2 * ${y} <= 40`, "wood_limit");
m.constraint(c`2 * ${x} + ${y} <= 50`, "labor_limit");

await m.solve();
console.log(`Produce: x=${x.value}, y=${y.value} (Profit: $${m.objectiveValue})`);
```

---

## 🎯 What WaSHI provides

1. **Algebraic model construction**: Formulate optimization models using domain-specific variable constructors (`m.binary`, `m.integer`, `m.continuous`), tagged template literals (`expr`, `c`), vector aggregations (`dot`, `sum`), and first-class constraints (`m.constraint`).
2. **Solver adapters**: Use a common modeling API with HiGHS, Z3, or GLPK, or [register your own adapter](https://github.com/ohtaman/washi/blob/main/docs/custom-solver-guide.md). Choose an engine that supports the model's problem class; the adapters do not make every solver support every feature.
3. **Local execution and WebAssembly distribution**: With the local solver adapters, solving runs in the application without a separate Python service or native C/C++ build. Browser deployments must include the generated JS, Worker, and WASM assets. Offline use also requires those resources to be available locally or cached. Z3 has additional browser isolation requirements.
4. **Named constraints and SMT results**: With Z3, explicitly check satisfiability and inspect conflicting constraints (`conflicts` / `unsatCore`) to investigate infeasibilities. A returned core is a conflicting subset, not necessarily the smallest one.

Model construction and translation are WaSHI's responsibility. Supported problem classes, numerical behavior, and solve time depend on the selected solver, its settings, and the problem. Modeling overhead and solver execution time should be measured separately; a result for one model is not a general performance guarantee.

---

## ⚙️ Solver adapters and capabilities

| Adapter | Engine license | Supported problem classes | Engine role | Integration |
| :--- | :--- | :--- | :--- | :--- |
| **HiGHS** | **MIT** | **LP, MIP, convex QP** | Numerical optimization | Built-in default |
| **Z3** | **MIT** | **SMT, SAT, logic, MIP** | Satisfiability checks, unsatisfiable cores, optimization | Optional plugin (`@ohtaman/washi/solvers/z3`) |
| **GLPK** | **GPL-3.0** | **LP, MIP** | Linear and mixed-integer optimization | Optional plugin (`@ohtaman/washi/solvers/glpk`) |
| **Mock** | **MIT** | — | Simulated solver responses for integration tests | Built-in; does not solve the model |

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
import { Model, expr, c, maximize } from "@ohtaman/washi";

const m = new Model("FactoryPlanning");

// Decision variables (Integer, non-negative)
const chairs = m.integer("chairs", { lb: 0 });
const tables = m.integer("tables", { lb: 0 });

// Natural formula objective & constraints via Tagged Template Literals
m.objective(maximize(expr`30 * ${chairs} + 50 * ${tables}`));
m.constraint(c`${chairs} + 2 * ${tables} <= 40`, "wood_limit");
m.constraint(c`2 * ${chairs} + ${tables} <= 50`, "labor_limit");

// Solve using default HiGHS WASM engine
const status = await m.solve();

console.log(`Status: ${status}`); // "Optimal"
console.log(`Objective: $${m.objectiveValue}`); // 1100
console.log(`Chairs: ${chairs.value}, Tables: ${tables.value}`); // 20 chairs, 10 tables
```

#### 🗂 Multidimensional Variables Grid

Construct variable arrays or multi-index matrices in one call:

```ts
// 1D dictionary of binary variables
const openCity = m.binary(["Tokyo", "Osaka", "Nagoya"]);

// 2D transport flow matrix: [Factory] x [Store]
const flow = m.continuous(["F1", "F2"], ["StoreA", "StoreB"], { lb: 0 });

// 2D coordinate grid (e.g. 8x8 chessboard)
const board = m.binary(8, 8, { prefix: "queen" });
```

#### 🔀 Big-M Indicator Constraints (`m.indicator`)

Model conditional activation rules and fixed-charge economics without manual Big-M algebra:

```ts
// If factory is closed (openCity['Tokyo'] == 0), its production capacity must be 0
m.indicator(openCity["Tokyo"], c`${flow["F1"]["StoreA"]} <= 0`, {
  activeValue: 0,
  M: 1000,
});
```

---

### 2. Portfolio Risk Minimization (Convex Quadratic Programming)

Minimize investment risk based on a covariance matrix subject to return and budget constraints:

```ts
import { Model, QuadExpr, sum, dot, c, minimize } from "@ohtaman/washi";

const m = new Model("MarkowitzPortfolio");
const assets = ["Tech", "Bonds", "RealEstate"];
const returns = [0.14, 0.04, 0.08];

// Decision variables: portfolio allocation weights (0 to 1)
const w = m.continuous(assets, { lb: 0, ub: 1 });

// 1. Fully invested budget: sum(w) == 1.0
m.constraint(c`${sum(assets, (a) => w[a])} == 1.0`, "budget");

// 2. Minimum target return: portfolio return >= 8.5%
const retMap = Object.fromEntries(assets.map((a, i) => [a, returns[i]]));
m.constraint(c`${dot(retMap, w)} >= 0.085`, "min_return");

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
    risk = risk.add(w[assets[i]].mul(w[assets[j]]).mul(cov[i][j]));
  }
}
m.objective(minimize(risk));

await m.solve();
console.log(`Minimal Variance: ${m.objectiveValue?.toFixed(6)}`);
assets.forEach((name) => {
  console.log(`  ${name}: ${((w[name].value || 0) * 100).toFixed(2)}%`);
});
```

---

### 3. SMT Logic & Rule Engines (with Z3)

Express boolean variables, propositional connectives (`and`, `or`, `implies`, `not`, `xor`), and mixed arithmetic rules:

```ts
import { Model, not, c } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ name: "SmartSecurityRules" });

const isNight = m.bool("isNight");
const motion = m.bool("motion");
const alarm = m.bool("alarm");
const siren = m.bool("siren");
const lux = m.integer("lux", { lb: 0 });

// Logical rules
m.constraint(lux.le(50).implies(isNight), "dark_implies_night");
m.constraint(motion.and(isNight).and(alarm).implies(siren), "alarm_rule");

// Current sensor observations
m.constraint(c`${lux} <= 10`, "sensor_dark");
m.constraint(motion, "sensor_motion");
m.constraint(alarm, "alarm_on");

// Check satisfiability and deduce state without an objective function
const res = await m.check({ solver: "z3" });

console.log(`Satisfiable? ${res.status === "Sat"}`); // true
console.log(`Siren active? ${m.values.get("siren")}`); // true
```

---

### 4. Conflict Diagnosis (`conflicts` / `unsatCore`)

When business rules or constraints contradict each other, extract a **conflicting constraint subset** (unsatisfiable core; minimality is not guaranteed) for troubleshooting (requires Z3):

```ts
import { Model, c } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });
const engineers = m.integer("engineers", { lb: 0, ub: 20 });
const budget = m.continuous("budget", { lb: 0, ub: 100000 });
const rushDelivery = m.bool("rushDelivery");

// Rule 1: Each engineer costs $8,000
m.constraint(c`8000 * ${engineers} <= ${budget}`, "budget_limit");

// Rule 2: Customer requires rush delivery
m.constraint(rushDelivery, "rush_required");

// Rule 3: Rush delivery requires at least 8 engineers
m.constraint(rushDelivery.implies(engineers.ge(8)), "rush_staffing_rule");

// Rule 4: Hard board budget cap of $50,000 (Conflict: 8 * $8000 = $64,000 > $50,000!)
m.constraint(c`${budget} <= 50000`, "strict_board_budget_cap");

// Rule 5: Innocent bystander rule
m.constraint(c`${engineers} >= 1`, "minimum_one_employee");

const res = await m.check({ solver: "z3" });

console.log(`Status: ${res.status}`); // "Unsat"
console.log("Conflicting constraints:", res.conflicts);
// Output: ["budget_limit", "rush_required", "rush_staffing_rule", "strict_board_budget_cap"]
// Note: "minimum_one_employee" is correctly excluded!
```

---

### 5. Solving with GLPK (GPL-3.0)

To use the GNU Linear Programming Kit (GLPK) solver plugin:

```ts
import { Model, expr, c, maximize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/glpk";

const m = new Model({ solver: "glpk" });
const x = m.integer("x", { lb: 0 });
const y = m.integer("y", { lb: 0 });

m.objective(maximize(expr`30 * ${x} + 50 * ${y}`));
m.constraint(c`${x} + 2 * ${y} <= 40`, "wood_limit");
m.constraint(c`2 * ${x} + ${y} <= 50`, "labor_limit");

const status = await m.solve();
console.log(`Status: ${status}`); // "Optimal"
console.log(`Objective: ${m.objectiveValue}`); // 1100
```

---

### 6. Vector Operations & Fast Dot Product

Cleanly compute 1D/2D linear combinations without nested loops:

```ts
import { Model, dot } from "@ohtaman/washi";

const m = new Model();
const factories = ["Tokyo", "Osaka"];
const stores = ["StoreA", "StoreB"];

const costs = {
  Tokyo: { StoreA: 4, StoreB: 7 },
  Osaka: { StoreA: 8, StoreB: 3 },
};

const ship = m.continuous(factories, stores);

// Total transportation cost in one line:
m.minimize(dot(costs, ship));
await m.optimize();

// Extract all optimal variable values as a structured object
const solution = m.getValues(ship);
console.log(solution);
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
  const x = model.continuous("x", { lb: 0, ub: 10 });
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
  const x = model.continuous("x", { lb: 0, ub: 10 });
  model.maximize(x);
  model.solve().then(status => console.log("GLPK status:", status));
</script>
```

> [!NOTE]
> **Z3 in Browser Environments & Cross-Origin Isolation**:
> Because the Z3 WebAssembly engine uses multithreading (`SharedArrayBuffer`), modern browsers require cross-origin isolation. The HTML document response must send:
> ```http
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```
> And any cross-origin assets must serve `Cross-Origin-Resource-Policy: cross-origin`.
> 
> General static sites without custom header control (e.g. standard GitHub Pages or preview platforms) and third-party iframe embeds (e.g. CodePen / JSFiddle) do not satisfy these requirements without extra setup. Importing `@ohtaman/washi` never automatically injects or registers a Service Worker into consumer applications.
> 
> To enable Z3 on GitHub Pages, the official WaSHI Web Demo bundles a dedicated `coi-serviceworker.js` strictly scoped to `/washi/`. On fresh browser sessions, it registers the worker and reloads once to establish `window.crossOriginIsolated === true` before running Z3. Environments lacking Service Workers or failing isolation abort Z3 execution with a descriptive explanation rather than hanging.

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

## 💻 Examples and browser demo

Start with the [example gallery](https://github.com/ohtaman/washi/blob/main/examples/README.md) or the [online Example & Feature Finder](https://ohtaman.github.io/washi/examples/), which organize examples by problem category and by WaSHI API feature.

| Category | Example | What it demonstrates | Solver |
| :--- | :--- | :--- | :--- |
| **Fundamentals** | [Production planning](https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts) | Integer variables, a profit objective, and resource constraints (`expr`, `c`) | HiGHS |
| **Fundamentals** | [Transportation network](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts) | 2D origin-destination variable matrix (`continuous(rows, cols)`) and flow balance | HiGHS |
| **Fundamentals** | [Diet & sensitivity analysis](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) | Shadow prices (`constr.dual`), surpluses (`constr.slack`), and reduced costs (`var.reducedCost`) | HiGHS |
| **Practical** | [Staff shift scheduling](https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts) | Weekly roster optimization + diagnosing conflicting Saturday vacation requests | HiGHS + Z3 |
| **Practical** | [E-commerce coupon optimizer](https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts) | Conditional spend thresholds (`indicator`), coupon exclusivity, and add-on recommendations | HiGHS |
| **Practical** | [Portfolio allocation](https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts) | A convex quadratic objective (`QuadExpr`) with allocation constraints | HiGHS |
| **Logic / SMT** | [Business rule checks](https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts) | Arithmetic and Boolean constraints (`bool`, `implies`) with satisfiability checking | Z3 |
| **Logic / SMT** | [Conflict diagnosis](https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts) | Named constraints and an unsatisfiable core (`unsatCore`) | Z3 |

[Open the hosted demo](https://ohtaman.github.io/washi/demo/) to edit and run models in your browser. For browser ESM, classic script tags, and CodePen, see the [distribution examples](https://github.com/ohtaman/washi/blob/main/examples/distribution/README.md). Z3 requires cross-origin isolation; see the browser requirements above.

To run examples locally, clone the repository and install its development dependencies first:

```bash
git clone https://github.com/ohtaman/washi.git
cd washi
npm ci
npx tsx examples/node/01-production-planning.ts
npx tsx examples/node/09-transportation-problem.ts
npx tsx examples/node/10-diet-sensitivity.ts
npx tsx examples/node/11-shift-scheduling.ts
npx tsx examples/node/12-ecommerce-coupon-optimizer.ts

# Local browser demo: http://localhost:5173/demo/
npm run dev
```

The example sources import the repository's `src/` modules. In an application using the published package, import `@ohtaman/washi` and the required solver plugin instead.

---

## 🧪 Testing

Run the repository's unit and integration tests, and build the distributions:

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
