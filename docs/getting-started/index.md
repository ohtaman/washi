# Introduction & Installation

Welcome to **WaSHI** (WebAssembly-backed, Solver-independent, High-level modeling Interface).

WaSHI brings the algebraic modeling style of Python's **PuLP** and Julia's **JuMP** to the TypeScript and JavaScript ecosystem. You can formulate mathematical optimization problems using algebraic expressions and solve them locally using WebAssembly solvers (**HiGHS**, **Z3**, and **GLPK**)—without a separate Python service or native C/C++ build steps.

### Why TypeScript & WebAssembly?

- **Removing the deployment bottleneck**: In traditional optimization workflows (e.g., Python with PuLP or Pyomo), turning a model into an interactive application requires provisioning a backend service and managing native C/C++ solver binaries. As AI-assisted development accelerates UI and application prototyping, backend infrastructure often becomes the primary bottleneck to shipping. Running both the modeler and WebAssembly solvers on standard Web technologies allows an optimization tool to be deployed as static assets (e.g., on GitHub Pages or Cloudflare Pages, serving the generated JS, Worker, and WASM files; with COOP/COEP headers when using Z3)—and makes it straightforward to pair mathematical optimization with in-browser LLMs (e.g., WebGPU / WebLLM) entirely on the client.
- **Algebraic syntax without operator overloading (`expr`)**: Because JavaScript lacks operator overloading, libraries usually trade off between verbose method chaining (`x.mul(30).add(y.mul(50))`) and untyped strings (`"30 * x + 50 * y"`). WaSHI uses tagged template literals (`` expr`30 * ${x} + 50 * ${y} <= 40` ``) similar to parameterized SQL queries—parsing infix operators while binding `${x}` directly as typed TypeScript object references for static type checking, IDE symbol renaming, and multi-dimensional indexing (`${flow[i][j]}`).

---

## 📦 Installation

Install WaSHI using your preferred package manager:

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

### Optional Solver Dependencies

WaSHI ships with **HiGHS** built-in with zero configuration. If you need SMT logic / Unsat Core diagnosis via **Z3**, or compatibility with **GLPK**, install their respective peer dependencies:

```bash
# For SMT logic and Unsat Core conflict diagnosis
npm install z3-solver

# For GLPK solver (GPL-3.0)
npm install glpk.js
```

---

## 🚀 Quickstart Walkthrough

Here is a step-by-step example of solving a production allocation problem.

### 1. Import the Core Classes

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";
```

### 2. Instantiate a Model

```typescript
const model = new Model("WoodworkingProfit");
```

### 3. Add Decision Variables

Variables represent the unknowns you want to determine. Factory methods (`m.continuous`, `m.integer`, `m.binary`) clearly define their domain:

```typescript
const x = model.integer("x", { lb: 0 });
const y = model.integer("y", { lb: 0 });
```

### 4. Set the Objective Function

Use the `expr` tagged template literal along with `maximize(...)` or `minimize(...)` to define the goal:

```typescript
// Maximize 30*x + 50*y
model.objective(maximize(expr`30 * ${x} + 50 * ${y}`));
```

### 5. Add Constraints

Use `model.constraint()` with the `expr` tagged template to formulate equality and inequality constraints:

```typescript
model.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_capacity");
model.constraint(expr`2 * ${x} + ${y} <= 50`, "labor_capacity");
```

### 6. Solve and Extract Results

Solve the model asynchronously via WebAssembly (HiGHS by default):

```typescript
const status = await model.solve();

console.log("Status:", status); // "Optimal"
console.log("Optimal Objective Value:", model.objectiveValue); // 1100
console.log(`Solution: x = ${x.value}, y = ${y.value}`); // x = 20, y = 10
```

---

## 🧭 Next Steps

- Give AI coding agents a concise API & deployment reference with the [AI Coding Agent Quick-Reference Guide](./ai-agents.md).
- Learn how to run WaSHI across different environments in [Runtime Environments](./runtimes.md).
- Understand how to formulate complex expressions in the [Modeling Guide](../guide/expressions.md).
- Explore built-in and pluggable solvers in the [Solvers Matrix](../solvers/).
- Browse 9 runnable optimization and SMT recipes in [Examples & API Finder](../examples/).

