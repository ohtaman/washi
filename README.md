<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/washi-header-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/washi-header-light.png">
    <img alt="WaSHI - Mathematical Optimization Modeler in TypeScript" src="./assets/washi-header-light.png" width="420" />
  </picture>
  <p><strong>Mathematical Optimization Modeler in TypeScript</strong></p>
  <p>
    <em>Linear Programming (LP) • Mixed-Integer Programming (MIP) • Convex Quadratic Programming (QP) • SMT &amp; Conflict Diagnosis</em>
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

**WaSHI** (WebAssembly-backed, Solver-independent, High-level modeling Interface) is an algebraic modeler for mathematical optimization and constraint programming in TypeScript and JavaScript, inspired by Python's **PuLP**. Define variables, objectives, and constraints in application code, and solve them locally in Node.js or the browser using **HiGHS** (default), **Z3**, or **GLPK**.

## ✨ Key Features

- **Natural Algebraic Syntax**: Write expressions and constraints directly with `` expr`30 * ${x} + 50 * ${y} <= 40` ``, `sum`, and `dot`.
- **Runs in Node.js & Browsers**: Powered by WebAssembly—no Python service or native C/C++ build required.
- **Solver-Independent**: Use built-in **HiGHS**, optional **Z3** and **GLPK** plugins, or custom solver adapters.
- **Satisfiability & Conflict Diagnosis**: Check logical/arithmetic feasibility and pinpoint contradictory constraints when a model is infeasible.
- **Decomposition Methods**: Built-in support for Column Generation and Benders Decomposition on large-scale problems.

## 📚 Documentation & Links

- **[Documentation](https://washi.ohtaman.dev/)**: Modeling guide, solver references, and deployment guides
- **[Interactive Showcase](https://washi.ohtaman.dev/showcase/) & [Browser Playground](https://washi.ohtaman.dev/demo/)**: Try live optimization apps and edit models in the browser
- **[Examples](https://washi.ohtaman.dev/examples/)**: Problem recipes and runnable Node.js / browser scripts ([`examples/`](examples/README.md))
- **[AI Agent Guide](docs/getting-started/ai-agents.md) · [Agent Skill (`SKILL.md`)](skills/washi/SKILL.md) · [`llms.txt`](https://washi.ohtaman.dev/llms.txt) / [`llms-full.txt`](https://washi.ohtaman.dev/llms-full.txt)**: Compact reference, workflow skill, and machine-readable docs for AI coding agents

---

## 📦 Installation & Quick Start

```bash
npm install @ohtaman/washi

# Optional solver plugins
npm install z3-solver   # For SMT logic & unsat core diagnosis
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
| **[HiGHS](https://github.com/ERGO-Code/HiGHS)** | MIT | LP, MIP, Convex QP | Numerical optimization & elastic conflict repair | Built-in default |
| **[Z3](https://github.com/Z3Prover/z3)** | MIT | SMT, SAT, Logic, MIP | Logical rules, satisfiability & exact `unsatCore` | `import "@ohtaman/washi/solvers/z3"` |
| **[GLPK](https://www.gnu.org/software/glpk/)** | GPL-3.0 | LP, MIP | Linear & mixed-integer optimization | `import "@ohtaman/washi/solvers/glpk"` |
| **Mock** | MIT | — | Deterministic unit & integration testing | Built-in (`MockSolver`) |

Pass `{ solver: "z3" }` or `{ solver: "glpk" }` to `new Model(...)`, `m.solve(...)`, or `m.check(...)` after importing the plugin.

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

### 3. SMT Logic & Conflict Diagnosis (`m.check`)

Express logical implications and diagnose why a model is infeasible:
- **HiGHS (default)**: Isolates an **elastic repair set** (`res.conflicts`)—constraints whose relaxation restores feasibility.
- **Z3**: Extracts an **unsatisfiable core** (`res.unsatCore` / `res.conflicts`)—a mutually contradictory subset of constraints.

```ts
import { Model, implies, expr } from "@ohtaman/washi";
// import "@ohtaman/washi/solvers/z3"; // Optional: for exact SMT unsatCore

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

- **Bundlers (Vite / webpack 5)**: `import { Model } from "@ohtaman/washi"` works out of the box. Solves run in a Web Worker by default; pass `{ useWorker: false }` for main-thread execution.
- **Standalone ESM / Script Tag / CDN**: Serve `dist/browser/` (including `highs.wasm` and worker chunks) or load from a CDN.

```html
<!-- Browser ESM -->
<script type="module">
  import { Model } from "./washi/washi.js";
  // Optional solver plugins: import "./washi/solvers/glpk.js" or "./washi/solvers/z3.js"
  const m = new Model();
  await m.solve();
</script>

<!-- Classic Script / CodePen (exposes global Washi) -->
<script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.min.js"></script>
```

> [!NOTE]
> **Z3 in the Browser**: Because Z3's WebAssembly build uses `SharedArrayBuffer`, browsers require Cross-Origin Isolation (`COOP: same-origin` and `COEP: require-corp`). See the [Cross-Origin Isolation Guide](docs/getting-started/cross-origin.md) and [`examples/distribution/`](examples/distribution/README.md).

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local development setup, running tests and benchmarks, rebuilding WebAssembly assets, and the release workflow.

---

## 🙏 Acknowledgments

WaSHI stands on the shoulders of the open-source mathematical optimization and automated reasoning communities:

- **[HiGHS](https://highs.dev/)** ([`ERGO-Code/HiGHS`](https://github.com/ERGO-Code/HiGHS)) — High-performance open-source optimization software for LP, MIP, and Convex QP initiated at the University of Edinburgh by Julian Hall, Qi Huangfu, Ivet Galabova, Leona Gottwald, Michael Feldmeier, and contributors, which powers WaSHI's built-in default solver (*Huangfu & Hall, Mathematical Programming Computation, 2018*, [DOI: 10.1007/s12532-017-0130-5](https://doi.org/10.1007/s12532-017-0130-5)).
- **[Z3 Theorem Prover](https://github.com/Z3Prover/z3)** ([`z3-solver`](https://www.npmjs.com/package/z3-solver)) — Developed at Microsoft Research, powering WaSHI's optional SMT satisfiability and exact `unsatCore` conflict diagnosis plugin.
- **[GLPK](https://www.gnu.org/software/glpk/) & [`glpk.js`](https://github.com/jvail/glpk.js)** — Powering WaSHI's optional GPL-3.0 LP/MIP solver plugin.
- **[PuLP](https://github.com/coin-or/pulp)** — Inspiring WaSHI's declarative algebraic modeling ergonomics.

---

## 📄 License

- **`@ohtaman/washi`**: [MIT License](./LICENSE)
- **Bundled / Optional Engines**: HiGHS (MIT), Z3 (MIT), GLPK (GPL-3.0). See [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md) for full details.
