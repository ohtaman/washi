# Introduction & Installation

**WaSHI** (WebAssembly-backed, Solver-independent, High-level modeling Interface) brings Python PuLP-style algebraic modeling to TypeScript and JavaScript. You can write linear, quadratic, and logical expressions with tagged templates (`expr`) and model mathematical optimization and constraint programming problems directly in **Node.js (18+)** and modern browsers.

---

## 📦 Installation

Installing `@ohtaman/washi` bundles two zero-dependency solvers out of the box, with two additional solvers available as optional dependencies:

| Solver | Install | Problem Classes & Capabilities |
| --- | --- | --- |
| **HiGHS** *(default)* | Bundled in `@ohtaman/washi` | Linear, mixed-integer, and convex quadratic programming — `LP`, `MIP`, and `QP`. |
| **Pumpkin** | Bundled in `@ohtaman/washi` (`@ohtaman/washi/solvers/pumpkin`) | Constraint Programming (`CP`) and exact `unsatCore` conflict diagnosis on bounded integers and booleans. |
| **Z3** | Optional (`z3-solver`) | Satisfiability Modulo Theories (`SMT`), continuous logic, and exact `unsatCore` diagnosis (including continuous variables). |
| **GLPK** | Optional (`glpk.js`) | Alternative `LP` and `MIP` solver under the GPL-3.0 license. |

::: code-group

```bash [npm]
npm install @ohtaman/washi
```

```bash [pnpm]
pnpm add @ohtaman/washi
```

```bash [yarn]
yarn add @ohtaman/washi
```

```bash [bun]
bun add @ohtaman/washi
```

:::

Install optional dependencies when you need **Z3** or **GLPK**:

```bash
npm install z3-solver   # Optional: SMT logic and unsatCore diagnosis for models with continuous variables
npm install glpk.js     # Optional: GLPK solver (GPL-3.0)
```

In browsers, Z3 requires a Secure Context and Cross-Origin Isolation headers — `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`, abbreviated `COOP`/`COEP`. See [Cross-Origin Isolation](./cross-origin.md) for server setup.

Using an AI coding agent? See [Coding with AI Agents](./coding-agents.md) for `npx skills add ohtaman/washi`, `llms.txt`, and ready-to-use prompt templates.

---

## 🚀 Quick Start

A typical WaSHI optimization workflow follows three steps: declare decision variables, register an objective and named constraints, and solve and verify the result.

The production-planning example below maximizes profit from desks and chairs under wood and labor limits:

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model("production");

// 1. Define decision variables with realistic finite bounds (lb / ub)
const desks = m.integer("desks", { lb: 0, ub: 100 });
const chairs = m.integer("chairs", { lb: 0, ub: 100 });

// 2. Set the objective function and constraints
m.objective(maximize(expr`30 * ${desks} + 50 * ${chairs}`));
m.constraint(expr`${desks} + 2 * ${chairs} <= 40`, "wood_capacity");
m.constraint(expr`2 * ${desks} + ${chairs} <= 50`, "labor_capacity");

// 3. Solve (bundled HiGHS WebAssembly) and verify the solution
const status = await m.solve();
if (m.hasPrimalSolution) {
  const report = m.verify();
  console.log(status, report.valid); // "Optimal", true
  console.log(`Profit: ${m.objectiveValue} (desks=${desks.value}, chairs=${chairs.value})`); // 1100 (desks=20, chairs=10)
}
```

1. **Define decision variables**: Create variables with `m.continuous()`, `m.integer()`, or `m.binary()`. For continuous and integer variables, supply finite `lb` and `ub` bounds whenever they are known.
2. **Describe the objective and constraints**: Write algebraic formulas with `` expr`...` `` and register them with `m.objective()` and `m.constraint()`. Pass descriptive constraint names so infeasibility reports identify conflicting rules clearly.
3. **Solve and verify**: Call `await m.solve()` to run the bundled HiGHS solver. Check `m.hasPrimalSolution` before reading `.value`, then call `m.verify()` to confirm bounds, integrality, and constraints hold.

---

## 🧭 Next Steps

### Choose Your Workflow

- **Build with an AI Coding Agent**: [Coding with AI Agents](./coding-agents.md) — Skill setup via `npx skills add ohtaman/washi`, `llms.txt` / Context7, and ready-to-use prompt templates.
- **Write Models in TypeScript**: [Modeling Guide](../guide/variables.md) — Variable containers, `sum` and `dot` aggregations, logical constraints, and conflict diagnosis.

### Reference & Examples

- **[Examples & API Finder](../examples/)**: 12 runnable optimization, CP, and SMT recipes—from shift scheduling to portfolio QP.
- **[Solvers Overview](../solvers/)**: Side-by-side comparison of bundled HiGHS and Pumpkin against optional Z3 and GLPK.
- **[Runtime Environments](./runtimes.md)**: Setup details for Node.js, Vite/Next.js, CDNs, standalone HTML, and desktop/mobile WebViews.
