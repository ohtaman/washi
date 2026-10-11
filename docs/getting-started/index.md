# Introduction & Installation

Welcome to **WaSHI** (WebAssembly Algebraic System for Hybrid & Integer modeling).

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
import { Model, expr, c } from "@ohtaman/washi";
```

### 2. Instantiate a Model

```typescript
// Create a maximization model
const model = new Model({ sense: "Maximize" });
```

### 3. Add Decision Variables

Variables represent the unknowns you want to determine. You can specify bounds and variable types (`"Continuous"`, `"Integer"`, or `"Binary"`):

```typescript
const x = model.addVar({ type: "Integer", lb: 0, name: "x" });
const y = model.addVar({ type: "Integer", lb: 0, name: "y" });
```

### 4. Set the Objective Function

Use the `expr` tagged template literal to write algebraic formulas naturally:

```typescript
// Maximize 30*x + 50*y
model.maximize(expr`30 * ${x} + 50 * ${y}`);
```

### 5. Add Constraints

Use the `c` tagged template literal to formulate equality and inequality constraints:

```typescript
model.addConstraint(c`${x} + 2 * ${y} <= 40`, "wood_capacity");
model.addConstraint(c`2 * ${x} + ${y} <= 50`, "labor_capacity");
```

### 6. Solve and Extract Results

Solve the model asynchronously. The solver automatically selects WebAssembly (HiGHS by default):

```typescript
const result = await model.solve();

console.log("Status:", model.status); // "Optimal"
console.log("Optimal Objective Value:", model.objectiveValue); // 1100
console.log(`Solution: x = ${x.value}, y = ${y.value}`); // x = 20, y = 10
```

---

## 🧭 Next Steps

- Learn how to run WaSHI across different environments in [Runtime Environments](./runtimes.md).
- Understand how to formulate complex expressions in the [Modeling Guide](../guide/expressions.md).
- Explore built-in and pluggable solvers in the [Solvers Matrix](../solvers/).
