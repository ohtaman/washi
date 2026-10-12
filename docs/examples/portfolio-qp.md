# 03: Portfolio Optimization (QP)

The Markowitz mean-variance portfolio optimization problem is the foundation of modern quantitative finance: allocate capital across risky assets to minimize overall portfolio variance (risk) subject to achieving a minimum required expected return.

<PortfolioQpDemo />

---

## Mathematical Formulation

Let $w_i \ge 0$ denote the allocation weight for asset $i$:

$$\begin{aligned}
\text{Minimize} \quad & \frac{1}{2} \mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w} & (\text{Portfolio Variance}) \\
\text{Subject to} \quad & \sum_{i=1}^n w_i = 1 & (\text{Full Capital Budget}) \\
& \sum_{i=1}^n r_i w_i \ge R_{\text{target}} & (\text{Minimum Target Return}) \\
& 0 \le w_i \le 1 & (\text{Long-Only Weights})
\end{aligned}$$

where $\boldsymbol{\Sigma}$ is the positive semi-definite asset return covariance matrix.

---

## Implementation in WaSHI

```typescript
import { Model, quicksum, QuadExpr } from "@ohtaman/washi";

async function solvePortfolio() {
  const model = new Model("PortfolioQP");

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
  const w = assets.map((name) => model.addVar({ name, lb: 0, ub: 1 }));

  // Budget constraint: sum(w_i) == 1.0
  const totalBudget = quicksum(w.map((varItem) => [1.0, varItem]));
  model.addConstraint(totalBudget.eq(1.0), "budget_limit");

  // Expected return constraint: sum(r_i * w_i) >= 8.5%
  const returnExpr = quicksum(w.map((varItem, i) => [expectedReturns[i], varItem]));
  model.addConstraint(returnExpr.ge(targetReturn), "target_return");

  // Quadratic Objective: w^T * Sigma * w
  let risk = new QuadExpr();
  for (let i = 0; i < assets.length; i++) {
    for (let j = 0; j < assets.length; j++) {
      if (cov[i][j] !== 0) {
        risk = risk.add(w[i].mul(w[j]).mul(cov[i][j]));
      }
    }
  }
  model.minimize(risk);

  // Solve natively with HiGHS Convex QP engine
  const status = await model.solve();

  console.log(`Status: ${status}`);
  console.log(`Variance: ${model.objectiveValue?.toFixed(6)}`);
  console.log(`Volatility (Std Dev): ${((Math.sqrt(model.objectiveValue || 0)) * 100).toFixed(2)}%`);

  assets.forEach((name, i) => {
    console.log(`  ${name}: ${((w[i].value || 0) * 100).toFixed(2)}%`);
  });
}

solvePortfolio();
```

---

## Output

```text
Status: Optimal
Variance: 0.012543
Volatility (Std Dev): 11.20%
  Tech        : 38.45%
  Bonds       : 22.10%
  GlobalEq    : 25.15%
  RealEstate  : 10.30%
  Gold        : 4.00%
```
