# Introduction & Installation

**WaSHI** (WebAssembly-backed, Solver-independent, High-level modeling Interface) brings the algebraic modeling style of Python's **PuLP** to the TypeScript and JavaScript ecosystem. Write expressions naturally with tagged templates (`expr`) and solve mathematical optimization and constraint programming problems directly in **Node.js and the browser** using WebAssembly solvers (**HiGHS**, **Pumpkin**, **Z3**, and **GLPK**).

---

## 📦 Installation

Both the default **HiGHS** solver (LP / MIP / Convex QP) and the **Pumpkin** CP/LCG solver (`@ohtaman/washi/solvers/pumpkin`) are bundled with zero external dependencies and work out of the box:

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

## 🚀 Quick Start

Here is a complete production-planning model illustrating the three steps of a typical WaSHI workflow:

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

// 3. Solve (built-in HiGHS WebAssembly) and verify the solution
const status = await m.solve();
if (m.hasPrimalSolution) {
  const report = m.verify();
  console.log(status, report.valid); // "Optimal", true
  console.log(`Profit: ${m.objectiveValue} (desks=${desks.value}, chairs=${chairs.value})`); // 1100 (desks=20, chairs=10)
}
```

1. **Define decision variables (`lb`, `ub`)**: Create variables with `m.continuous()`, `m.integer()`, or `m.binary()`, providing finite `lb` and `ub` bounds when known.
2. **Describe the objective and constraints (`expr`)**: Formulate equations naturally with `` expr`...` ``, and pass constraint names to make infeasibility debugging straightforward.
3. **Solve and verify (`solve`, `verify`)**: `await m.solve()` runs the bundled HiGHS WebAssembly solver. Check `m.hasPrimalSolution` before reading `.value`, and call `m.verify()` to independently verify that bounds, integrality, and constraints hold.

---

## 🧭 Next Steps

- **[Modeling Guide](../guide/variables.md)**: Array/dictionary variables, aggregations (`sum`, `dot`), logical constraints, and conflict diagnosis
- **[Examples & API Finder](../examples/)**: 12 runnable optimization and SMT recipes—from shift scheduling and portfolio QP to vehicle routing
- **[Solvers Overview](../solvers/)**: Compare bundled HiGHS and Pumpkin with optional Z3 and GLPK adapters
- **[Runtime Environments](./runtimes.md)**: Setup details for Node.js, Vite / Next.js bundlers, CDNs, and static hosting
