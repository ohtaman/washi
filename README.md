<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/washi-header-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/washi-header-light.png">
    <img alt="WaSHI - Mathematical Optimization Modeler in TypeScript" src="./assets/washi-header-light.png" width="420" />
  </picture>
  <p><strong>Mathematical Optimization Modeler in TypeScript</strong></p>
  <p>
    <em>Linear Programming (LP) • Mixed-Integer Programming (MIP) • Convex Quadratic Programming (QP) • Constraint Programming (CP) • SMT &amp; Conflict Diagnosis</em>
  </p>
  <p>
    <a href="./README.md">English</a> •
    <a href="./README.ja.md">日本語</a> •
    <a href="./README.zh-CN.md">简体中文</a>
  </p>
  <p>
    <a href="https://www.npmjs.com/package/@ohtaman/washi"><img src="https://img.shields.io/npm/v/@ohtaman/washi?color=crimson&label=npm" alt="npm version" /></a>
    <a href="https://github.com/ohtaman/washi/actions/workflows/distribution.yml"><img src="https://github.com/ohtaman/washi/actions/workflows/distribution.yml/badge.svg" alt="CI Status" /></a>
    <a href="https://washi.ohtaman.dev/"><img src="https://img.shields.io/badge/docs-online-blue" alt="docs" /></a>
    <a href="https://washi.ohtaman.dev/demo/"><img src="https://img.shields.io/badge/demo-playground-brightgreen" alt="live demo" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
  </p>
</div>

---

**WaSHI** (WebAssembly-backed, Solver-independent, High-level modeling Interface) is an algebraic modeler for mathematical optimization and constraint programming in TypeScript and JavaScript, inspired by Python's **PuLP**. Define variables, objectives, and constraints in application code, and solve them locally in Node.js or the browser using bundled **HiGHS** (default) and **Pumpkin** (`{ solver: "pumpkin" }`), or optional **Z3** and **GLPK** plugins.

## ✨ Key Features

- **Natural Algebraic Syntax**: Write expressions and constraints directly with `` expr`30 * ${x} + 50 * ${y} <= 40` ``, `sum`, and `dot`.
- **Runs in Node.js & Browsers**: Powered by WebAssembly—no Python service or native C/C++ build required.
- **Solver-Independent**: Use bundled zero-dependency **HiGHS** (LP/MIP/QP) and **Pumpkin** (CP), optional **Z3** and **GLPK** plugins, or custom solver adapters.
- **Satisfiability & Conflict Diagnosis**: Check logical/arithmetic feasibility and pinpoint contradictory constraints when a model is infeasible.
- **Decomposition Methods**: Built-in support for Column Generation and Benders Decomposition on large-scale problems.

## 📚 Documentation & Links

- **[Documentation](https://washi.ohtaman.dev/)**: Modeling guide, solver references, and deployment guides
- **[Interactive Showcase](https://washi.ohtaman.dev/showcase/) · [Browser Playground](https://washi.ohtaman.dev/demo/) · [Optimization N Exercises](https://washi.ohtaman.dev/exercises/)**: Try live optimization apps, practice interactive modeling workouts, and edit models in the browser
- **[Examples](https://washi.ohtaman.dev/examples/)**: Problem recipes and runnable Node.js / browser scripts ([`examples/`](examples/README.md))
- **[Agent Skill (`SKILL.md`)](skills/washi/SKILL.md) · [`llms.txt`](https://washi.ohtaman.dev/llms.txt) / [`llms-full.txt`](https://washi.ohtaman.dev/llms-full.txt)**: Workflow skill and machine-readable docs for AI coding agents

---

## 📦 Installation & Quick Start

```bash
npm install @ohtaman/washi
# HiGHS (LP/MIP/QP, default) and Pumpkin (CP, { solver: "pumpkin" }) are bundled with zero extra dependencies or plugin imports

# Optional peer-dependency solver plugins
npm install z3-solver   # For SMT logic & exact real/integer unsat core diagnosis
npm install glpk.js     # For GLPK solver (GPL-3.0)

# Optional skill for AI coding agents (Claude Code, Cursor, Codex, etc.)
npx skills add ohtaman/washi
```

```ts
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model("WoodworkingProfit");
const x = m.integer("desks", { lb: 0 });
const y = m.integer("chairs", { lb: 0 });

m.objective(maximize(expr`30 * ${x} + 50 * ${y}`));
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_limit");
m.constraint(expr`2 * ${x} + ${y} <= 50`, "labor_limit");

await m.solve();
console.log(`Produce: x=${x.value}, y=${y.value} (Profit: $${m.objectiveValue})`);
```

---

## ⚙️ Solvers

| Solver | License | Problem Classes | Primary Use Case | Setup |
| :--- | :--- | :--- | :--- | :--- |
| **[HiGHS](https://github.com/ERGO-Code/HiGHS)** | MIT | LP, MIP, Convex QP | Numerical optimization & conflict diagnosis (constraint relaxation) | Bundled default (zero deps, no extra import) |
| **[Pumpkin](https://github.com/ConSol-Lab/Pumpkin)** | MIT | CP (Lazy Clause Generation), Logic, Bounded Integer | Combinatorial scheduling & bounded-integer `unsatCore` | Bundled (`{ solver: "pumpkin" }`, zero deps, no extra import) |
| **[Z3](https://github.com/Z3Prover/z3)** | MIT | SMT, SAT, Logic, MIP | Logical rules, satisfiability & exact `unsatCore` | `npm install z3-solver` + `import "@ohtaman/washi/solvers/z3"` |
| **[GLPK](https://www.gnu.org/software/glpk/)** | GPL-3.0 | LP, MIP | Linear & mixed-integer optimization | `npm install glpk.js` + `import "@ohtaman/washi/solvers/glpk"` |
| **Mock** | MIT | — | Deterministic unit & integration testing | Built-in (`MockSolver`) |

Switch between bundled HiGHS (default) and Pumpkin with `{ solver: "pumpkin" }` out of the box, or pass `{ solver: "z3" }` / `{ solver: "glpk" }` after importing the corresponding optional plugin. Solver-specific classes and loader helpers (`HighsSolver`, `setHighsWasmUrl`, `PumpkinSolver`, `setPumpkinWasmUrl`, etc.) live under `@ohtaman/washi/solvers/{highs,pumpkin,z3,glpk}`.

---

## 🚀 Usage Examples

### 1. Sums, Dot Products (`sum` / `dot`) & Conditional Constraints

Combine indexed variables with `dot` / `sum` and express conditional rules with `m.indicator()`:

```ts
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("TransportPlanning");
const factories = ["Tokyo", "Osaka"];
const stores = ["StoreA", "StoreB"];
const costs = {
  Tokyo: { StoreA: 4, StoreB: 7 },
  Osaka: { StoreA: 8, StoreB: 3 },
};

const open = m.binary(factories);
const ship = m.continuous(factories, stores, { lb: 0, ub: 500 });

// If Tokyo is closed (open["Tokyo"] == 0), total shipment from Tokyo must be 0
m.indicator(open["Tokyo"], expr`sum(${ship["Tokyo"]}) <= 0`, { activeValue: 0 });
m.constraint(expr`${ship["Tokyo"]["StoreA"]} + ${ship["Osaka"]["StoreA"]} >= 100`, "demand_A");

m.objective(minimize(expr`dot(${costs}, ${ship})`));
await m.solve();

console.log("Tokyo -> StoreA:", ship["Tokyo"]["StoreA"].value);
```

### 2. Convex Quadratic Programming (QP)

Minimize a quadratic objective subject to linear constraints:

```ts
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("PortfolioQP");
const x = m.continuous("tech", { lb: 0, ub: 1 });
const y = m.continuous("bonds", { lb: 0, ub: 1 });

m.constraint(expr`${x} + ${y} == 1`, "budget");
m.constraint(expr`0.14 * ${x} + 0.04 * ${y} >= 0.08`, "min_return");
m.objective(minimize(expr`0.04 * ${x}^2 + 0.005 * ${y}^2`));

await m.solve();
console.log(`Tech: ${x.value?.toFixed(2)}, Bonds: ${y.value?.toFixed(2)}`);
```

### 3. Constraint Programming & Disjunctive Scheduling (Pumpkin)

Use bundled **Pumpkin** (`{ solver: "pumpkin" }`) for bounded integer scheduling and CP global constraints (`disjoint`, `distinct`, `cumulative`, `allowed`) with zero external dependencies or extra imports:

```ts
import { Model, expr, disjoint, distinct, minimize } from "@ohtaman/washi";

const m = new Model("WorkshopCP", { solver: "pumpkin" });
const start = m.integer(["cut", "weld", "paint"] as const, { lb: 0, ub: 20, prefix: "start" });
const bench = m.integer(["cut", "weld", "paint"] as const, { lb: 1, ub: 3, prefix: "bench" });

m.constraint(
  disjoint([
    { start: start.cut, duration: 4 },
    { start: start.weld, duration: 3 },
    { start: start.paint, duration: 2 },
  ]),
  "single_line"
);
m.constraint(expr`${start.cut} + 4 <= ${start.weld}`, "cut_before_weld");
m.constraint(expr`${start.weld} + 3 <= ${start.paint}`, "weld_before_paint");
m.constraint(distinct(bench), "unique_benches");

m.objective(minimize(expr`${start.paint} + 2`));
await m.solve();
console.log(`Makespan: ${m.objectiveValue}h (paint starts at ${start.paint.value}h)`);
```

### 4. Logic & Conflict Diagnosis (`m.check`)

Express logical implications and diagnose why a model is infeasible:
- **HiGHS (default)**: Identifies constraints whose relaxation restores feasibility (`res.conflicts`).
- **Pumpkin (bundled)**: Extracts an exact **unsatisfiable core** (`res.unsatCore` / `res.conflicts`) for bounded integer and boolean models.
- **Z3**: Extracts an exact SMT **unsatisfiable core** (`res.unsatCore` / `res.conflicts`) including continuous and rational arithmetic.

```ts
import { Model, implies, expr } from "@ohtaman/washi";
// Pass { solver: "pumpkin" } for bundled bounded-int/bool exact unsatCore (no extra import)
// import "@ohtaman/washi/solvers/z3"; // Optional: exact SMT unsatCore including Continuous vars

const m = new Model("StaffingRules");
const engineers = m.integer("engineers", { lb: 0, ub: 20 });
const budget = m.continuous("budget", { lb: 0, ub: 100000 });
const rush = m.bool("rush");

m.constraint(expr`8000 * ${engineers} <= ${budget}`, "budget_limit");
m.constraint(rush, "rush_required");
m.constraint(implies(rush, expr`${engineers} >= 8`), "rush_staffing");
m.constraint(expr`${budget} <= 50000`, "budget_cap"); // Conflict: 8 * $8,000 > $50,000
m.constraint(expr`${engineers} >= 1`, "min_staff");   // Unrelated rule

const res = await m.check(); // Or: await m.check({ solver: "z3" })
console.log(res.status);     // "Unsat"
console.log(res.conflicts);  // HiGHS: ["rush_required"]
```

---

## 🌐 Browser & Web Worker Usage

- **Bundlers (Vite / webpack 5)**: `import { Model } from "@ohtaman/washi"` works out of the box. On standard browser origins (`http://` / `https://`), **HiGHS** and **Pumpkin** run in dedicated Web Workers by default (opaque origins such as `file://` default to `{ useWorker: false }`, and you can pass `{ useWorker: false }` explicitly for main-thread execution).
- **Standalone ESM / Script Tag / CDN**: Serve `dist/browser/` (including `solvers/highs.wasm`, `solvers/pumpkin.wasm`, and worker chunks) or load from a CDN. `washi.js` and `washi.min.js` both include HiGHS and Pumpkin out of the box.

```html
<!-- Browser ESM (includes both HiGHS and Pumpkin) -->
<script type="module">
  import { Model } from "./washi/washi.js";
  // Optional solver plugins:
  // import "./washi/solvers/glpk.js";    // Optional GLPK plugin
  // import "./washi/solvers/z3.js";      // Optional Z3 plugin (see note below)
  const m = new Model();
  await m.solve();
</script>

<!-- Classic Script / CodePen (exposes global Washi with both HiGHS and Pumpkin) -->
<script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.min.js"></script>
<!-- Optional solver plugin scripts (auto-register on window.Washi): -->
<!-- <script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/solvers/glpk.min.js"></script> -->
```

> [!NOTE]
> **Z3 in the Browser**: Because Z3's WebAssembly build uses `SharedArrayBuffer`, browsers require a **Secure Context** (`HTTPS` or `localhost`) and Cross-Origin Isolation headers (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`). See the [Cross-Origin Isolation Guide](docs/getting-started/cross-origin.md) and [`examples/distribution/`](examples/distribution/README.md). **HiGHS**, **Pumpkin**, and **GLPK** work without Cross-Origin Isolation headers.

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local development setup, running tests and benchmarks, rebuilding WebAssembly assets, and the release workflow.

---

## 🙏 Acknowledgments

WaSHI stands on the shoulders of the open-source mathematical optimization and automated reasoning communities:

- **[HiGHS](https://highs.dev/)** ([`ERGO-Code/HiGHS`](https://github.com/ERGO-Code/HiGHS)) — High-performance open-source optimization software for LP, MIP, and Convex QP initiated at the University of Edinburgh by Julian Hall, Qi Huangfu, Ivet Galabova, Leona Gottwald, Michael Feldmeier, and contributors, which powers WaSHI's built-in default solver (*Huangfu & Hall, Mathematical Programming Computation, 2018*, [DOI: 10.1007/s12532-017-0130-5](https://doi.org/10.1007/s12532-017-0130-5)).
- **[Pumpkin](https://github.com/ConSol-Lab/Pumpkin)** — Lazy Clause Generation (LCG) constraint programming solver developed in Rust by ConSol Lab (TU Delft), powering WaSHI's bundled CP and `unsatCore` engine.
- **[Z3 Theorem Prover](https://github.com/Z3Prover/z3)** ([`z3-solver`](https://www.npmjs.com/package/z3-solver)) — Developed at Microsoft Research, powering WaSHI's optional SMT satisfiability and exact `unsatCore` conflict diagnosis plugin.
- **[GLPK](https://www.gnu.org/software/glpk/) & [`glpk.js`](https://github.com/jvail/glpk.js)** — Powering WaSHI's optional GPL-3.0 LP/MIP solver plugin.
- **[PuLP](https://github.com/coin-or/pulp)** — Inspiring WaSHI's declarative algebraic modeling ergonomics.

---

## 📄 License

- **`@ohtaman/washi`**: [MIT License](./LICENSE)
- **Bundled / Optional Engines**: HiGHS (MIT), Pumpkin (MIT), Z3 (MIT), GLPK (GPL-3.0). See [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md) for full details.
