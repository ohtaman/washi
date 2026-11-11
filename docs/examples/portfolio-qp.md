# Portfolio Optimization (QP)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Convex Quadratic Programming (QP) | HiGHS (default) | `m.continuous()`, `m.constraint()`, `expr`, `minimize`, `dot`, `QuadExpr` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=portfolio_qp">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts">Source Code</a></li></ul> |

The Markowitz mean-variance portfolio optimization problem is the foundation of modern quantitative finance: allocate capital across risky assets to minimize overall portfolio variance (risk) subject to achieving a minimum required expected return.

<PortfolioQpDemo />

## Mathematical Formulation

Let $w_i \ge 0$ denote the allocation weight for asset $i$:

$$\begin{aligned}
\text{Minimize} \quad & \mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w} & (\text{Portfolio Variance}) \\
\text{Subject to} \quad & \sum_{i=1}^n w_i = 1 & (\text{Full Capital Budget}) \\
& \sum_{i=1}^n r_i w_i \ge R_{\text{target}} & (\text{Minimum Target Return}) \\
& 0 \le w_i \le 1 & (\text{Long-Only Weights})
\end{aligned}$$

where $\boldsymbol{\Sigma}$ is the positive semi-definite asset return covariance matrix.

## Implementation in WaSHI

<CodeRunner preset="portfolio_qp">

```typescript
import { Model, QuadExpr, dot, minimize, expr } from "@ohtaman/washi";

async function solvePortfolio() {
  const m = new Model("PortfolioQP");

  const assets = ["Tech", "Bonds", "GlobalEq", "RealEstate", "Gold"];
  const expectedReturns = [0.12, 0.04, 0.09, 0.07, 0.05];
  const targetReturn = 0.085; // 8.5% minimum expected return

  // 5x5 Covariance Matrix
  const cov = [
    [0.040, 0.002, 0.025, 0.015, 0.005],
    [0.002, 0.005, 0.003, 0.002, 0.001],
    [0.025, 0.003, 0.030, 0.018, 0.008],
    [0.015, 0.002, 0.018, 0.025, 0.004],
    [0.005, 0.001, 0.008, 0.004, 0.020],
  ];

  // Allocation weights w_i in [0, 1]
  const w = m.continuous(assets, { lb: 0, ub: 1 });

  // 1. Budget constraint: sum(w_i) == 1.0 (100%)
  m.constraint(expr`sum(${w}) == 1.0`, "budget_limit");

  // 2. Expected return constraint: sum(r_i * w_i) >= 8.5%
  const retMap = Object.fromEntries(assets.map((a, i) => [a, expectedReturns[i]]));
  const portfolioReturn = dot(retMap, w);
  m.constraint(expr`${portfolioReturn} >= ${targetReturn}`, "target_return");

  // 3. Quadratic Objective: minimize risk w^T * Sigma * w
  let risk = new QuadExpr();
  for (let i = 0; i < assets.length; i++) {
    for (let j = 0; j < assets.length; j++) {
      if (cov[i][j] !== 0) {
        risk = risk.add(w[assets[i]].mul(w[assets[j]]).mul(cov[i][j]));
      }
    }
  }
  m.objective(minimize(risk));

  // Solve natively with HiGHS Convex QP engine
  const status = await m.solve();

  console.log(`Status: ${status}`);
  console.log(`Variance: ${m.objectiveValue?.toFixed(6)}`);
  console.log(`Volatility (Std Dev): ${((Math.sqrt(m.objectiveValue || 0)) * 100).toFixed(2)}%`);
  console.log(`Expected Return: ${((portfolioReturn.value ?? 0) * 100).toFixed(2)}% (target >= ${(targetReturn * 100).toFixed(2)}%)`);

  assets.forEach((name) => {
    console.log(`  ${name.padEnd(10)}: ${((w[name].value ?? 0) * 100).toFixed(2)}%`);
  });
}

solvePortfolio();
```

</CodeRunner>

## Practical Notes

- **Tracing the Efficient Frontier (`targetReturn` & `portfolioReturn.value`)**: Because the achieved return (`8.50%`) matches `targetReturn` exactly, the return constraint is tightly binding on the Markowitz efficient frontier. Varying `targetReturn` across `[0.05, 0.12]` traces out the full risk-return frontier.
- **Risk-Aversion Scalarization vs. Target Return Constraint**: If `targetReturn` is set above the highest single-asset return ($12\%$ for `Tech` under long-only weights), the hard constraint $\mathbf{r}^T \mathbf{w} \ge R_{\text{target}}$ becomes `"Infeasible"`. An alternative formulation that is always feasible for any risk appetite $\lambda > 0$ is to minimize the risk-adjusted objective $\min (\lambda \, \mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w} - \mathbf{r}^T \mathbf{w})$.
