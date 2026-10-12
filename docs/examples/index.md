# Examples & API Finder

Explore runnable optimization and logic formulations built with WaSHI. Every example can be executed directly inside its documentation page, or edited in the [Playground](https://ohtaman.github.io/washi/demo/).

## Examples

| Example | Problem Class | Solver | Key WaSHI APIs | Description | Code Editor |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **[Production Planning](./production.md)** | LP / MIP | HiGHS | `m.integer()`, `m.constrain()`, `expr` | Basic variables, tagged template literal equations, and maximizing profit under resource limits. | [Playground](https://ohtaman.github.io/washi/demo/?preset=production) |
| **[0-1 Knapsack](./knapsack.md)** | Binary MIP | HiGHS | `m.binary(keys)`, `sum()`, `m.constrain()` | 1D dictionary of `Binary` variables and linear aggregation over item arrays. | [Playground](https://ohtaman.github.io/washi/demo/?preset=knapsack) |
| **[Transportation Network](./transportation.md)** | LP | HiGHS | `m.continuous(rows, cols)`, `dot()`, `m.constrain()` | 2D matrix indexing (`ship[factory][store]`) and row/column flow balance constraints. | [Playground](https://ohtaman.github.io/washi/demo/?preset=transportation) |
| **[Diet & Sensitivity Analysis](./diet-sensitivity.md)** | LP | HiGHS | `constr.dual`, `constr.slack`, `var.reducedCost` | Reading shadow prices (bottlenecks), constraint surpluses, and reduced costs after solving. | [Playground](https://ohtaman.github.io/washi/demo/?preset=diet_sensitivity) |
| **[Staff Shift Scheduling](./shift-scheduling.md)** | Binary MIP + Unsat Core | HiGHS + Z3 | `m.binary(staff, days)`, `check()`, `unsatCore` | 8×7 weekly roster planner (coverage, senior duty, max shifts, day-off requests) and diagnosing conflicting vacation requests with Z3 `unsatCore`. | [Playground](https://ohtaman.github.io/washi/demo/?preset=shift_scheduling) |
| **[E-Commerce Coupon Optimizer](./ecommerce-coupons.md)** | Indicator MIP | HiGHS | `m.indicator()`, `sum()`, `m.constrain()` | Checkout optimizer using `m.indicator()` for minimum spend thresholds, exclusive vs. stackable rules, and smart filler add-on suggestions. | [Playground](https://ohtaman.github.io/washi/demo/?preset=cart_coupon) |
| **[Portfolio Optimization](./portfolio-qp.md)** | Convex QP | HiGHS | `m.continuous()`, `m.constrain()`, `dot()`, `QuadExpr` | Markowitz mean-variance risk minimization ($w^T \Sigma w$) using `QuadExpr` subject to return targets. | [Playground](https://ohtaman.github.io/washi/demo/?preset=portfolio_qp) |
| **[SMT Security Policies](./smt-security.md)** | SMT Logic | Z3 | `m.addBoolVar()`, `m.constrain()`, `m.check()` | Propositional variables (`BoolVar`) and logical connectives (`implies`, `and`, `not`, `xor`) mixed with integer bounds. | [Playground](https://ohtaman.github.io/washi/demo/?preset=smt_sat_scheduling) |
| **[Conflict Diagnosis (`unsatCore`)](./unsat-core.md)** | Unsat Core | Z3 | `m.constrain()`, `m.check()`, `m.unsatCore` | Extracting a conflicting constraint subset (`unsatCore`) when staffing and budget rules contradict each other. | [Playground](https://ohtaman.github.io/washi/demo/?preset=conflict_diagnosis_unsat) |

## Find by WaSHI API (Reverse Index)

Looking for a specific modeling method or solver capability? Jump straight to the example that demonstrates it:

| Feature / API | Description | Example Page | Node.js Source |
| :--- | :--- | :--- | :--- |
| ``m.constrain(expr`...`)`` | Tagged template literal constraints | [Production Planning](./production.md) | [`01-production-planning.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts) |
| `m.binary(keys)` / `m.continuous(keys)` | 1D dictionary of indexed variables | [0-1 Knapsack](./knapsack.md) | [`02-knapsack-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts) |
| `m.continuous(rows, cols)` / `m.binary(rows, cols)` | 2D matrix of indexed variables | [Transportation Network](./transportation.md), [Shift Scheduling](./shift-scheduling.md) | [`09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts) |
| `dot(matrix, vars2d)` / `dot(vector, vars)` | Fast vector/matrix dot product | [Transportation Network](./transportation.md), [Portfolio Optimization](./portfolio-qp.md) | [`09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts) |
| `constr.dual` & `constr.slack` | Shadow prices & constraint surpluses | [Diet & Sensitivity Analysis](./diet-sensitivity.md) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `var.reducedCost` | Variable reduced costs in LP | [Diet & Sensitivity Analysis](./diet-sensitivity.md) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `m.indicator()` | Big-M conditional constraints (`binVar => constr`) | [E-Commerce Coupon Optimizer](./ecommerce-coupons.md) | [`12-ecommerce-coupon-optimizer.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts) |
| `new QuadExpr()` | Convex quadratic objectives ($x^T Q x$) | [Portfolio Optimization](./portfolio-qp.md) | [`03-portfolio-qp.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts) |
| `m.addBoolVar()` & `.implies()` | Propositional logic & SMT rules | [SMT Security Policies](./smt-security.md) | [`04-smt-security-rules.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts) |
| `m.check()` & `m.unsatCore` | Feasibility check & conflict diagnosis | [Conflict Diagnosis](./unsat-core.md), [Shift Scheduling](./shift-scheduling.md) | [`05-unsat-core-diagnosis.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts) |
| `solver: "glpk"` | Solving LP/MIP with GLPK plugin | [GLPK Solver Guide](../solvers/glpk.md) | [`08-glpk-solver-plugin.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/08-glpk-solver-plugin.ts) |

## Running Examples Locally in Node.js

All standalone scripts are located in [`examples/node/`](https://github.com/ohtaman/washi/tree/main/examples/node):

```bash
npx tsx examples/node/01-production-planning.ts
npx tsx examples/node/02-knapsack-problem.ts
npx tsx examples/node/03-portfolio-qp.ts
npx tsx examples/node/04-smt-security-rules.ts
npx tsx examples/node/05-unsat-core-diagnosis.ts
npx tsx examples/node/07-hybrid-smt-mip.ts
npx tsx examples/node/08-glpk-solver-plugin.ts
npx tsx examples/node/09-transportation-problem.ts
npx tsx examples/node/10-diet-sensitivity.ts
npx tsx examples/node/11-shift-scheduling.ts
npx tsx examples/node/12-ecommerce-coupon-optimizer.ts
```
