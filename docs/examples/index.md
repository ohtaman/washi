# Examples & Feature Finder

Explore runnable optimization and logic formulations built with WaSHI. Each example links to its step-by-step documentation, the [Interactive Browser Playground](https://ohtaman.github.io/washi/demo/), and the standalone TypeScript source under [`examples/node/`](https://github.com/ohtaman/washi/tree/main/examples/node).

---

## 1. Fundamentals (Core Modeling APIs)

Short, self-contained formulations (~30–50 lines) designed to teach one core WaSHI modeling concept at a time.

| Example | Problem Class | Key WaSHI APIs | What You Will Learn | Try It |
| :--- | :--- | :--- | :--- | :--- |
| **[Production Planning](./production.md)** | LP / MIP | `addVar()`, `expr`, `c` | Basic variables, tagged template literal equations, and maximizing profit under resource limits. | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=production) |
| **[0-1 Knapsack](./knapsack.md)** | Binary MIP | `addVars(keys)`, `sum()` | 1D dictionary of `Binary` variables and linear aggregation over item arrays. | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=knapsack) |
| **[Transportation Network](./transportation.md)** | LP | `addVars(rows, cols)`, `sum()` | 2D matrix indexing (`ship[factory][store]`) and row/column flow balance constraints. | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=transportation) |
| **[Diet & Sensitivity Analysis](./diet-sensitivity.md)** | LP | `constr.dual`, `constr.slack`, `var.reducedCost` | Reading shadow prices (bottlenecks), constraint surpluses, and reduced costs after solving. | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=diet_sensitivity) |

---

## 2. Practical Applications (Real-World Use Cases)

End-to-end application blueprints showing how WaSHI models business logic, conditional promotions, workforce schedules, and financial portfolios in TypeScript.

| Example | Problem Class | Solver | Key Highlights | Try It |
| :--- | :--- | :--- | :--- | :--- |
| **[Staff Shift Scheduling](./shift-scheduling.md)** | Binary MIP + Unsat Core | HiGHS + Z3 | Weekly roster generation (coverage, senior duty, max shifts, day-off requests) + diagnosing clashing vacation requests with Z3 `unsatCore`. | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=shift_scheduling) |
| **[E-Commerce Coupon Optimizer](./ecommerce-coupons.md)** | Indicator MIP | HiGHS | Client-side checkout optimizer using `addIndicator()` for minimum spend thresholds, exclusive vs. stackable rules, and smart filler add-on suggestions. | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=cart_coupon) |
| **[Portfolio Optimization](./portfolio-qp.md)** | Convex QP | HiGHS | Markowitz mean-variance risk minimization (`w^T * Cov * w`) using `QuadExpr` subject to return targets. | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=portfolio_qp) |

---

## 3. SMT Logic & Conflict Diagnosis

Satisfiability checking (`m.check()`) and isolating contradictory rule subsets (`unsatCore`) using the Z3 solver plugin.

| Example | Problem Class | Solver | Key Highlights | Try It |
| :--- | :--- | :--- | :--- | :--- |
| **[SMT Security Policies](./smt-security.md)** | SMT Logic | Z3 | Propositional variables (`BoolVar`) and logical connectives (`implies`, `and`, `not`, `xor`) mixed with integer bounds. | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=smt_sat_scheduling) |
| **[Conflict Diagnosis (`unsatCore`)](./unsat-core.md)** | Unsat Core | Z3 | Extracting a conflicting constraint subset (`unsatCore`) when staffing and budget rules contradict each other. | [▶ Demo](https://ohtaman.github.io/washi/demo/?preset=conflict_diagnosis_unsat) |

---

## 🔍 Find by WaSHI API (Feature Reverse Index)

Looking for a specific modeling method or solver capability? Jump straight to the example that demonstrates it:

| Feature / API | Description | Recommended Example | Node.js Source |
| :--- | :--- | :--- | :--- |
| ``expr`...` `` & ``c`...` `` | Tagged template literal formulas | [Production Planning](./production.md) | [`01-production-planning.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts) |
| `m.addVars(keys)` | 1D dictionary of indexed variables | [0-1 Knapsack](./knapsack.md) | [`02-knapsack-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts) |
| `m.addVars(rows, cols)` | 2D matrix of indexed variables | [Transportation Network](./transportation.md), [Shift Scheduling](./shift-scheduling.md) | [`09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts) |
| `constr.dual` & `constr.slack` | Shadow prices & constraint surpluses | [Diet & Sensitivity Analysis](./diet-sensitivity.md) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `var.reducedCost` | Variable reduced costs in LP | [Diet & Sensitivity Analysis](./diet-sensitivity.md) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `m.addIndicator()` | Big-M conditional constraints (`binVar => constr`) | [E-Commerce Coupon Optimizer](./ecommerce-coupons.md) | [`12-ecommerce-coupon-optimizer.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts) |
| `new QuadExpr()` | Convex quadratic objectives ($x^T Q x$) | [Portfolio Optimization](./portfolio-qp.md) | [`03-portfolio-qp.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts) |
| `m.addBoolVar()` & `.implies()` | Propositional logic & SMT rules | [SMT Security Policies](./smt-security.md) | [`04-smt-security-rules.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts) |
| `m.check()` & `m.unsatCore` | Feasibility check & conflict diagnosis | [Conflict Diagnosis](./unsat-core.md), [Shift Scheduling](./shift-scheduling.md) | [`05-unsat-core-diagnosis.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts) |
| `LpProblem` / `lpSum` | Python PuLP-style helper API | [PuLP Syntax Guide](../guide/pulp-compat.md) | [`06-pulp-compatibility.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/06-pulp-compatibility.ts) |
| `solver: "glpk"` | Solving LP/MIP with GLPK plugin | [GLPK Solver Guide](../solvers/glpk.md) | [`08-glpk-solver-plugin.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/08-glpk-solver-plugin.ts) |

---

## Running Examples Locally in Node.js

All standalone scripts are located in [`examples/node/`](https://github.com/ohtaman/washi/tree/main/examples/node):

```bash
# 1. Fundamentals
npx tsx examples/node/01-production-planning.ts
npx tsx examples/node/02-knapsack-problem.ts
npx tsx examples/node/09-transportation-problem.ts
npx tsx examples/node/10-diet-sensitivity.ts

# 2. Practical Applications
npx tsx examples/node/11-shift-scheduling.ts
npx tsx examples/node/12-ecommerce-coupon-optimizer.ts
npx tsx examples/node/03-portfolio-qp.ts

# 3. SMT Logic, Hybrid Workflows & Solver Plugins
npx tsx examples/node/04-smt-security-rules.ts
npx tsx examples/node/05-unsat-core-diagnosis.ts
npx tsx examples/node/06-pulp-compatibility.ts
npx tsx examples/node/07-hybrid-smt-mip.ts
npx tsx examples/node/08-glpk-solver-plugin.ts
```
