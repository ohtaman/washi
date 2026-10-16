# Introduction & Installation

Welcome to **WaSHI** (WebAssembly-backed, Solver-independent, High-level modeling Interface).

WaSHI brings the expressive elegance of Python's **PuLP** and Julia's **JuMP** to the modern TypeScript and JavaScript ecosystem. You can formulate mathematical optimization problems using natural algebraic expressions and solve them natively using industrial WebAssembly solvers (**HiGHS**, **Z3**, and **GLPK**)—with zero native C/C++ compilation steps.

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

- Learn how to run WaSHI across different environments in [Runtime Environments](./runtimes.md).
- Understand how to formulate complex expressions in the [Modeling Guide](../guide/expressions.md).
- Explore built-in and pluggable solvers in the [Solvers Matrix](../solvers/).
