# Portfolio Optimization (QP)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Convex Quadratic Programming (QP) | HiGHS (default) | `m.continuous()`, `m.constraint()`, `expr`, `minimize`, `dot`, `QuadExpr` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=portfolio_qp">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts">Source Code</a></li></ul> |

The Markowitz mean-variance model is a classic problem in quantitative finance. It allocates capital across risky assets to minimize portfolio variance (risk) while meeting a minimum target return.

<PortfolioQpDemo />

## Mathematical Formulation

Let $n$ be the number of assets, $w_i$ be the allocation weight for asset $i$ (written as vector $\mathbf{w}$), $r_i$ be its expected return, and $R_{\text{target}}$ be the minimum target return:

$$\begin{aligned}
\text{Minimize} \quad & \mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w} & (\text{Portfolio Variance}) \\
\text{Subject to} \quad & \sum_{i=1}^n w_i = 1 & (\text{Full Capital Budget}) \\
& \sum_{i=1}^n r_i w_i \ge R_{\text{target}} & (\text{Minimum Target Return}) \\
& 0 \le w_i \le 1 \quad \forall i = 1, \dots, n & (\text{Long-Only Weights})
\end{aligned}$$

where $\boldsymbol{\Sigma}$ is the symmetric positive semi-definite asset return covariance matrix, making the objective a convex quadratic function.

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

  // 3. Quadratic Objective: minimize portfolio variance w^T * Sigma * w
  let risk = new QuadExpr();
  for (let i = 0; i < assets.length; i++) {
    for (let j = 0; j < assets.length; j++) {
      if (cov[i][j] !== 0) {
        risk = risk.add(w[assets[i]].mul(w[assets[j]]).mul(cov[i][j]));
      }
    }
  }
  m.objective(minimize(risk));

  // Solve with HiGHS QP solver
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

### Tracing the Efficient Frontier

The solved `portfolioReturn.value` matches `targetReturn` (`8.50%`) exactly, showing that the target return constraint is binding and the solution lies on the Markowitz efficient frontier for `8.50%`. Sweeping `targetReturn` from the minimum-variance portfolio's expected return (about `4.52%`) up to the maximum single-asset return (`12%`) traces the entire efficient frontier.

### Target Return Constraint vs. Risk-Aversion Scalarization

Under long-only weights ($0 \le w_i \le 1$), setting `targetReturn` above the highest single-asset return (`12%` for `Tech`) makes the hard return constraint `"Infeasible"`.

To drop the hard target-return constraint and keep the model feasible for any risk-aversion coefficient $\lambda > 0$, minimize the risk-adjusted objective using the expected return vector $\mathbf{r}$:

$$\min_{\mathbf{w}} \; \lambda \, \mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w} - \mathbf{r}^T \mathbf{w}$$
