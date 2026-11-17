# Introduction & Installation

**WaSHI** (WebAssembly-backed, Solver-independent, High-level modeling Interface) brings the algebraic modeling style of Python's **PuLP** to the TypeScript and JavaScript ecosystem. Write expressions naturally with tagged templates (`expr`) and solve mathematical optimization problems directly in **Node.js and the browser** using WebAssembly solvers (**HiGHS**, **Z3**, and **GLPK**).

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

// 3. Solve (built-in HiGHS WebAssembly) and validate the solution
const status = await m.solve();
if (m.hasPrimalSolution) {
  const report = m.validateSolution();
  console.log(status, report.valid); // "Optimal", true
  console.log(`Profit: ${m.objectiveValue} (desks=${desks.value}, chairs=${chairs.value})`); // 1100 (desks=20, chairs=10)
}
```

---

## 📦 Installation

The default **HiGHS** solver (LP / MIP / Convex QP) is bundled and works out of the box:

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

Install optional peer dependencies when you need **Z3** (SMT logic and Unsat Core conflict diagnosis) or **GLPK**, or add the optional skill for AI coding agents:

```bash
npm install z3-solver   # For SMT logic and Unsat Core conflict diagnosis
npm install glpk.js     # For GLPK solver (GPL-3.0)

# Optional skill for AI coding agents (Claude Code, Cursor, Codex, etc.)
npx skills add ohtaman/washi
```

---

## 🔍 Core Workflow Essentials

Three practical habits cover the essentials shown in the snippet above:

1. **Set realistic finite bounds (`lb`, `ub`)**: When defining variables with `m.continuous`, `m.integer`, or `m.binary`, finite bounds strengthen MIP presolve and enable automatic tight Big-M derivation for logical constraints.
2. **Formulate objectives and constraints with `expr`**: Use `` m.objective(maximize(expr`...`)) `` and `` m.constraint(expr`... <= ...`, "name") ``. Naming constraints lets you pinpoint conflicting rules immediately if a model becomes infeasible.
3. **Check `hasPrimalSolution` and call `validateSolution()`**: After `await m.solve()`, check `m.hasPrimalSolution` before reading `.value` on variables, and call `m.validateSolution()` to independently verify that bounds, integrality, and constraints hold within tolerance.

---

## 🧭 Next Steps

- **[Modeling Guide](../guide/variables.md)**: Array/dictionary variables, aggregations (`sum`, `dot`), logical constraints, and Unsat Core diagnosis
- **[Examples & API Finder](../examples/)**: 11 runnable optimization and SMT recipes—from shift scheduling and portfolio QP to vehicle routing
- **[Solvers Overview](../solvers/)**: Compare built-in HiGHS with optional Z3 and GLPK adapters
- **[Runtime Environments](./runtimes.md)**: Setup details for Node.js, Vite / Next.js bundlers, CDNs, and static hosting
