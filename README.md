# opt-ts

**Modern Mathematical Optimization Modeler for TypeScript & JavaScript**  
*LP (Linear Programming) • MIP (Mixed-Integer Programming) • QP (Convex Quadratic Programming)*

`opt-ts` is a high-level, intuitive mathematical optimization modeling library for TypeScript and JavaScript environments (Node.js, Browser, Bun, Deno, Next.js). Inspired by Python's **PuLP**, **python-mip**, and Julia's **JuMP**, it provides a fluent algebraic syntax for formulating and solving operations research problems.

Powered natively by the state-of-the-art **HiGHS** solver compiled to WebAssembly, `opt-ts` solves industrial-scale problems (20,000+ variables) with zero native C++ compile steps, while providing a pluggable interface to switch solvers seamlessly.

---

## ✨ Features

- **Intuitive Algebraic Syntax**: Express variables, linear expressions, and quadratic terms naturally (`x.mul(3).add(y)`, `x.mul(x)`).
- **LP, MIP & Convex QP**: Solves Linear, Mixed-Integer, and Quadratic Programming problems (e.g. Markowitz portfolio optimization, least squares).
- **Zero-Config WebAssembly Engine**: Runs out-of-the-box in Node.js and modern browsers via HiGHS WASM.
- **Pluggable Solvers Architecture**:
  - `HiGHS` (default, WebAssembly)
  - `MockSolver` (for CI/CD and unit testing without WASM)
  - Simple 1-method `Solver` interface to connect custom backends or external solvers.
- **Framework Compatibility Layers**:
  - `pulp-compat`: 1-to-1 drop-in syntax matching Python's `pulp` (`LpProblem`, `LpVariable`, `LpMinimize`, `prob.solve(HiGHS())`).
  - `mip-compat`: Syntax matching `python-mip` (`MipModel`, `BINARY`, `model.optimize()`).
- **High-Performance Large-Scale Optimization**: $O(N)$ linear-time expression builder (`sum()`, `lpSum()`) capable of constructing and solving 20,000+ variable MIPs in seconds.
- **Strictly Typed & Zero Fluff**: Written 100% in TypeScript with comprehensive declarations and 70+ automated tests.

---

## 📦 Installation

```bash
npm install opt-ts
```

---

## 🚀 Quick Start (Node.js / TypeScript)

### 1. Mixed-Integer Linear Programming (MIP)

A production planning problem maximizing profit:

```ts
import { Model } from "opt-ts";

const m = new Model({ name: "ProductionPlanning", sense: "Maximize" });

// Decision variables (Integer, non-negative)
const chairs = m.addVar({ name: "chairs", type: "Integer", lb: 0 });
const tables = m.addVar({ name: "tables", type: "Integer", lb: 0 });

// Objective: Maximize profit ($30/chair + $50/table)
m.maximize(chairs.mul(30).add(tables.mul(50)));

// Constraints: Wood and Labor availability
m.addConstraint(chairs.add(tables.mul(2)).le(40), "wood_limit");
m.addConstraint(chairs.mul(2).add(tables).le(50), "labor_limit");

// Solve using built-in HiGHS WASM
const status = await m.solve();

console.log(`Status: ${status}`); // "Optimal"
console.log(`Max Profit: $${m.objectiveValue}`); // $1100
console.log(`Produce: ${chairs.value} chairs, ${tables.value} tables`); // 20 chairs, 10 tables
```

---

### 2. Convex Quadratic Programming (QP: Portfolio Optimization)

Minimize investment risk based on an asset covariance matrix while satisfying budget and return targets:

```ts
import { Model, QuadExpr, sum } from "opt-ts";

const m = new Model({ name: "PortfolioRiskMinimization", sense: "Minimize" });

const assets = ["Tech", "Bonds", "RealEstate"];
const returns = [0.14, 0.04, 0.08];

// Asset weights (0% to 100%)
const w = assets.map((a) => m.addVar({ name: `w_${a}`, lb: 0, ub: 1 }));

// 1. Budget constraint: 100% of capital allocated
m.addConstraint(sum(w).eq(1.0), "budget");

// 2. Return target: portfolio expected return >= 8.5%
m.addConstraint(sum(w.map((v, i) => v.mul(returns[i]))).ge(0.085), "min_return");

// 3. Covariance matrix (risk & correlation)
const cov = [
  [0.040, 0.002, 0.015],
  [0.002, 0.005, 0.002],
  [0.015, 0.002, 0.025],
];

// Objective: w^T * Cov * w (Quadratic Expression)
let variance = new QuadExpr();
for (let i = 0; i < assets.length; i++) {
  for (let j = 0; j < assets.length; j++) {
    variance = variance.add(w[i].mul(w[j]).mul(cov[i][j]));
  }
}
m.minimize(variance);

await m.solve();

console.log(`Optimal Variance: ${m.objectiveValue?.toFixed(6)}`);
assets.forEach((name, i) => {
  console.log(`  ${name}: ${((w[i].value || 0) * 100).toFixed(2)}%`);
});
```

---

### 3. PuLP-Compatible API (for Python PuLP Users)

If you are porting existing Python PuLP code to TypeScript/JavaScript:

```ts
import {
  LpProblem,
  LpVariable,
  LpMaximize,
  LpInteger,
  HiGHS,
  value,
} from "opt-ts";

const prob = new LpProblem("PuLPDemo", LpMaximize);

const x = new LpVariable("x", 0, undefined, LpInteger);
const y = new LpVariable("y", 0, undefined, LpInteger);

// PuLP += syntax equivalent
prob.add(x.mul(30).add(y.mul(50)));
prob.add(x.add(y.mul(2)).le(40));
prob.add(x.mul(2).add(y).le(50));

// Solve exactly like pulp.solve(HiGHS())
await prob.solve(new HiGHS());

console.log(`Status: ${prob.status}`);
console.log(`Objective: ${value(prob.objective)}`);
console.log(`x = ${value(x)}, y = ${value(y)}`);
```

---

### 4. Pluggable Solver & Capability Enforcement

`opt-ts` is solver-agnostic. Solvers declare their capabilities (`supportsMIP`, `supportsQP`), and `opt-ts` validates problem compatibility before dispatching:

```ts
import { Model, MockSolver, HiGHS } from "opt-ts";

const m = new Model();
// ... define model ...

// 1. Solve with HiGHS (default, supports LP, MIP, and QP)
await m.solve("highs");

// 2. Solve with GLPK (GNU Linear Programming Kit WASM, supports LP and MIP)
import { GLPKSolver } from "opt-ts";
await m.solve(new GLPKSolver());
// or simply: await m.solve("glpk");

// 3. Solve with MockSolver for ultra-fast CI/CD unit tests without WASM
const mock = new MockSolver({ values: { x: 10, y: 5 }, objectiveValue: 500 });
await m.solve(mock);

// 4. Define your own custom solver (e.g., enterprise backend, cloud worker)
const myCustomSolver = {
  name: "InternalClusterSolver",
  async solve(modelData, lpResult) {
    const res = await fetch("https://internal-solver.corp/solve", {
      method: "POST",
      body: JSON.stringify({ lp: lpResult.lpString }),
    });
    return await res.json();
  },
};

await m.solve(myCustomSolver);
```

---

## 🎨 Interactive Demo Showcase (Web UI)

This repository includes a standalone interactive demo UI built with a Zen light theme to demonstrate:
- **Large-Scale Supply Chain Facility Location & Distribution (20,050 variables)**
- **10-Nurse 7-Day Complex Scheduling Problem (NSP)**
- **N-Queens Puzzle (Binary Formulation)**
- **Markowitz Mean-Variance Portfolio Optimization (Convex QP)**

To launch the local demo:

```bash
npm install
npm run dev
```

Then open `http://localhost:5173/` in your browser.

---

## 🧪 Testing & Verification

Strict Test-Driven Development (TDD) is enforced across the entire library:

```bash
# Run all unit, integration, QP, and solver tests
npm test

# Build library distribution (ESM bundle + TypeScript declarations)
npm run build:lib
```

---

## 📄 License

MIT License.
