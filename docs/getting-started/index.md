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

Install optional peer dependencies only if you need **Z3** (SMT logic & Unsat Core diagnosis) or **GLPK**:

```bash
npm install z3-solver   # For SMT logic and Unsat Core conflict diagnosis
npm install glpk.js     # For GLPK solver (GPL-3.0)
```

---

## 💡 Why TypeScript & WebAssembly?

- **Zero native setup across Node.js and the browser**: No platform-specific C/C++ builds or separate Python runtimes to manage. A single `npm install` runs the same modeling code across **Node.js APIs, CLIs, and scripts** as well as in the **browser**.
- **Lightweight embedding with standard Web APIs & UIs**: Go beyond local analysis scripts by shipping **interactive Web tools, mini-games, or Chrome extensions** that anyone can open via a URL with zero backend hosting cost. You can wire mathematical optimization directly into drag-and-drop UIs or **standard browser capabilities**—such as screen/camera capture and speech recognition (Web Speech API)—with no network round-trips or external data transfer.
- **End-to-end type safety from app data to model**: Prevent common indexing and dictionary-key mistakes with TypeScript's type system. Typed variable dictionaries (`Record<K, Var>`) and variable-reference interpolation (`` expr`30 * ${qty.desk} <= 40` ``) connect directly to your application schemas, preserving compile-time variable/key checks, IDE autocompletion, and symbol renaming.
- **Strong synergy with AI development & LLM workflows**: Keeping your application and optimization model in a **single TypeScript codebase** lets you validate everything in one test runner—without crossing a Python service boundary—and deploy easily as static assets or a single service. That tight test-and-deploy loop fits AI-assisted coding naturally, while at runtime you can pair flexible LLM extraction with exact solver feasibility and conflict diagnosis (`unsatCore`) in the same runtime.

---

## 🔍 Core Workflow Essentials

Three practical habits cover the essentials shown in the snippet above:

1. **Set realistic finite bounds (`lb`, `ub`)**: When defining variables with `m.continuous`, `m.integer`, or `m.binary`, finite bounds strengthen MIP presolve and enable automatic tight Big-M derivation for logical constraints.
2. **Formulate objectives and constraints with `expr`**: Use `` m.objective(maximize(expr`...`)) `` and `` m.constraint(expr`... <= ...`, "name") ``. Naming constraints lets you pinpoint conflicting rules immediately if a model becomes infeasible.
3. **Check `hasPrimalSolution` and call `validateSolution()`**: After `await m.solve()`, check `m.hasPrimalSolution` before reading `.value` on variables, and call `m.validateSolution()` to independently verify that bounds, integrality, and constraints hold within tolerance.

---

## 🧭 Next Steps

- **[Ecosystem & From Python (PuLP)](./ecosystem.md)**: How WaSHI compares with raw WASM bindings (`highs`, `glpk.js`, `z3-solver`), pure-JS solvers (`yalps`, `javascript-lp-solver`), and Python `PuLP`
- **[Modeling Guide](../guide/variables.md)**: Array/dictionary variables, aggregations (`sum`, `dot`), logical constraints, and Unsat Core diagnosis
- **[Examples & API Finder](../examples/)**: 11 runnable optimization and SMT recipes—from shift scheduling and portfolio QP to vehicle routing
- **[Solvers Overview](../solvers/)**: Compare built-in HiGHS with optional Z3 and GLPK adapters
- **[Runtime Environments](./runtimes.md)**: Setup details for Node.js, Vite / Next.js bundlers, CDNs, and static hosting
