# Examples & API Finder

Explore runnable optimization and logic formulations built with WaSHI. Every example runs directly on its documentation page, and most can also be edited and run in the [Playground](https://washi.ohtaman.dev/demo/).

## Examples

| Example | Problem Class | Solver | Key WaSHI APIs | Description | Playground / Guide |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **[Production Planning](./production.md)** | Integer Programming (MIP) | HiGHS | `m.integer()`, `m.constraint()`, `expr` | Basic integer variables, tagged template equations, and profit maximization under resource caps. | [Playground](https://washi.ohtaman.dev/demo/?preset=production) |
| **[0-1 Knapsack Problem](./knapsack.md)** | Binary MIP | HiGHS | `m.binary(keys)`, `expr` (`dot`), `m.constraint()` | 1D dictionary of binary variables and weighted aggregation over item arrays. | [Playground](https://washi.ohtaman.dev/demo/?preset=knapsack) |
| **[Transportation & Allocation Network](./transportation.md)** | LP | HiGHS | `m.continuous(rows, cols)`, `expr` (`sum`, `dot`), `m.constraint()` | 2D matrix indexing (`ship[factory][store]`) and row/column supply-cap and demand-satisfaction constraints. | [Playground](https://washi.ohtaman.dev/demo/?preset=transportation) |
| **[Diet Problem & Sensitivity Analysis](./diet-sensitivity.md)** | LP | HiGHS | `constr.dual`, `constr.slack`, `var.reducedCost` | Reading dual values (shadow prices), constraint slacks, and reduced costs after solving. | [Playground](https://washi.ohtaman.dev/demo/?preset=diet_sensitivity) |
| **[Staff Shift Scheduling](./shift-scheduling.md)** | Binary MIP + Unsat Core | HiGHS + Z3* | `m.binary(staff, days)`, `m.check()`, `m.unsatCore` | 5×7 weekly roster optimization and diagnosing conflicting day-off requests with Z3 `unsatCore`. | [Playground](https://washi.ohtaman.dev/demo/?preset=shift_scheduling) |
| **[E-Commerce Cart & Coupon Optimizer](./ecommerce-coupons.md)** | Indicator MIP | HiGHS | `m.indicator()`, `expr` (`sum`, `dot`), `m.constraint()` | Checkout optimization with minimum spend rules, exclusive coupons, and optional add-on evaluation. | [Playground](https://washi.ohtaman.dev/demo/?preset=cart_coupon) |
| **[Portfolio Optimization (QP)](./portfolio-qp.md)** | Convex QP | HiGHS | `m.continuous()`, `m.constraint()`, `dot()`, `QuadExpr` | Markowitz mean-variance risk minimization ($\mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w}$) with `QuadExpr`. | [Playground](https://washi.ohtaman.dev/demo/?preset=portfolio_qp) |
| **[Project Scheduling (CP)](./project-scheduling.md)** | CP / LCG + Unsat Core | Pumpkin | `m.integer()`, `disjoint()`, `cumulative()`, `max()`, `m.check()` | 6-task resource-constrained schedule with a shared rig, 3-engineer crew cap, and deadline conflict diagnosis. | [Playground](https://washi.ohtaman.dev/demo/?preset=project_scheduling) |
| **[SMT Security Policies](./smt-security.md)** | SMT | Z3* | `m.bool()`, `implies()`, `and()`, `not()`, `m.check()` | Propositional `BoolVar` rules (`implies`, `and`, `not`) combined with integer sensor bounds. | [Playground](https://washi.ohtaman.dev/demo/?preset=smt_security) |
| **[Conflict Diagnosis (Unsat Core)](./unsat-core.md)** | LP / MIP + Unsat Core | Z3* + HiGHS | `m.constraint()`, `m.check()`, `m.conflicts` | Extracting a conflicting constraint subset when staffing and budget rules contradict each other. | [Playground](https://washi.ohtaman.dev/demo/?preset=conflict_diagnosis_unsat) |
| **[Vehicle Routing (CVRP)](./vehicle-routing.md)** | Combinatorial OR / Dantzig-Wolfe | HiGHS | `m.solveColumnGeneration()`, `pricing`, `constr.dual` | Dynamic route generation from dual values (shadow prices) to minimize fleet size. | [Decomposition Methods](../guide/decomposition.md) |
| **[Traveling Salesperson (TSP)](./traveling-salesperson.md)** | Combinatorial OR / Benders | HiGHS | `m.solveBenders()`, `subproblem` | Subtour elimination on the degree-assignment relaxation using dynamic Benders feasibility cuts. | [Decomposition Methods](../guide/decomposition.md) |

> [!NOTE]
> **Solver Preconditions**: HiGHS and Pumpkin are bundled with WaSHI. Examples marked `Z3*` require the optional peer package `z3-solver` (and `COOP`/`COEP` headers in browsers). Examples using GLPK require `glpk.js` (GPL-3.0 license).

## Find by WaSHI API (Reverse Index)

Looking for a specific modeling method or solver feature? Jump directly to the matching example or guide:

| Feature / API | Description | Example / Guide | Node.js Source |
| :--- | :--- | :--- | :--- |
| ``m.constraint(expr`...`)`` | Tagged template literal constraints | [Production Planning](./production.md) | [`01-production-planning.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts) |
| `m.binary(keys)` / `m.continuous(keys)` | 1D dictionary of indexed variables | [0-1 Knapsack Problem](./knapsack.md) | [`02-knapsack-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts) |
| `m.continuous(rows, cols)` / `m.binary(rows, cols)` | 2D matrix of indexed variables | [Transportation & Allocation Network](./transportation.md), [Staff Shift Scheduling](./shift-scheduling.md) | [`09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts), [`11-shift-scheduling.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts) |
| ``expr`dot(${A}, ${X})` `` / `dot(A, X)` | Vector and matrix dot product | [0-1 Knapsack Problem](./knapsack.md), [Transportation & Allocation Network](./transportation.md), [Portfolio Optimization (QP)](./portfolio-qp.md) | [`02-knapsack-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts), [`09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts) |
| `constr.dual` & `constr.slack` | Dual values (shadow prices) & constraint slacks | [Diet Problem & Sensitivity Analysis](./diet-sensitivity.md) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `var.reducedCost` | Variable reduced costs in LP | [Diet Problem & Sensitivity Analysis](./diet-sensitivity.md) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `m.indicator()` | Big-M conditional constraints (`binVar => constr`) | [E-Commerce Cart & Coupon Optimizer](./ecommerce-coupons.md) | [`12-ecommerce-coupon-optimizer.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts) |
| `new QuadExpr()` | Quadratic objectives ($\mathbf{x}^T \mathbf{Q} \mathbf{x}$, for convex QP) | [Portfolio Optimization (QP)](./portfolio-qp.md) | [`03-portfolio-qp.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts) |
| `m.bool()` & `implies()` | Propositional logic & SMT rules | [SMT Security Policies](./smt-security.md) | [`04-smt-security-rules.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts) |
| `m.check()` & `m.conflicts` | Feasibility check & conflict diagnosis (`conflicts` / `unsatCore`) | [Conflict Diagnosis (Unsat Core)](./unsat-core.md), [Staff Shift Scheduling](./shift-scheduling.md) | [`05-unsat-core-diagnosis.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts), [`11-shift-scheduling.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts) |
| Hybrid Z3 SMT + HiGHS MIP | Policy check with Z3 before MIP capacity allocation | [Z3 Solver Guide](../solvers/z3.md) | [`07-hybrid-smt-mip.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/07-hybrid-smt-mip.ts) |
| `m.solveColumnGeneration()` | Dantzig-Wolfe Column Generation | [Vehicle Routing (CVRP)](./vehicle-routing.md) | [`13-vehicle-routing-column-generation.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts) |
| `m.solveBenders()` | Benders Decomposition & lazy cuts | [Traveling Salesperson (TSP)](./traveling-salesperson.md) | [`14-traveling-salesperson-benders.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts) |
| `disjoint()` / `cumulative()` / `max()` | Scheduling global constraints & makespan objective | [Project Scheduling (CP)](./project-scheduling.md), [Constraint Programming (CP) Modeling](../guide/constraint-programming.md) | [`15-project-scheduling-cp.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/15-project-scheduling-cp.ts) |
| `distinct()` / `allowed()` / `at()` | CP value-domain, table, and element constraints | [Constraint Programming (CP) Modeling](../guide/constraint-programming.md), [Expressions](../guide/expressions.md) | — |
| `solver: "pumpkin"` | Bundled CP/LCG scheduling & discrete `unsatCore` | [Project Scheduling (CP)](./project-scheduling.md), [Pumpkin Guide](../solvers/pumpkin.md) | [`15-project-scheduling-cp.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/15-project-scheduling-cp.ts) |
| `solver: "glpk"` | LP/MIP via optional `glpk.js` plugin (GPL-3.0) | [GLPK Guide](../solvers/glpk.md) | [`08-glpk-solver-plugin.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/08-glpk-solver-plugin.ts) |

## Running Examples Locally in Node.js

All standalone scripts are located in [`examples/node/`](https://github.com/ohtaman/washi/tree/main/examples/node) (examples using Z3 or GLPK require the optional `z3-solver` or `glpk.js` package):

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
npx tsx examples/node/13-vehicle-routing-column-generation.ts
npx tsx examples/node/14-traveling-salesperson-benders.ts
npx tsx examples/node/15-project-scheduling-cp.ts
```
