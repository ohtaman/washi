# 投资组合优化 (凸二次规划 QP)

| 问题类别 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 凸二次规划 (Convex QP) | HiGHS (默认) | `m.continuous()`, `m.constraint()`, `expr`, `minimize`, `dot`, `QuadExpr` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=portfolio_qp">在演练场中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts">源代码</a></li></ul> |

马科维茨（Markowitz）均值-方差投资组合优化问题是现代量化金融的基石：在满足最低预期收益率要求及资金全额配置的前提下，将资金分配到各类风险资产中，从而最小化投资组合的整体方差（风险）。

<PortfolioQpDemo />

## 数学模型

设 $w_i \ge 0$ 表示分配给资产 $i$ 的投资权重：

$$\begin{aligned}
\text{Minimize} \quad & \mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w} & (\text{投资组合方差最小化}) \\
\text{Subject to} \quad & \sum_{i=1}^n w_i = 1 & (\text{100\% 资金预算约束}) \\
& \sum_{i=1}^n r_i w_i \ge R_{\text{target}} & (\text{最低目标预期收益率}) \\
& 0 \le w_i \le 1 & (\text{仅做多权重约束，禁止做空})
\end{aligned}$$

其中 $\boldsymbol{\Sigma}$ 为半正定的资产收益率协方差矩阵。

## WaSHI 实现

<CodeRunner preset="portfolio_qp">

```typescript
import { Model, QuadExpr, sum, dot, minimize, expr } from "@ohtaman/washi";

async function solvePortfolio() {
  const m = new Model("PortfolioQP");

  const assets = ["Tech", "Bonds", "GlobalEq", "RealEstate", "Gold"];
  const expectedReturns = [0.12, 0.04, 0.09, 0.07, 0.05];
  const targetReturn = 0.085; // 8.5% 最低预期收益率

  // 5×5 协方差矩阵
  const cov = [
    [0.040, 0.002, 0.025, 0.015, 0.005],
    [0.002, 0.005, 0.003, 0.002, 0.001],
    [0.025, 0.003, 0.030, 0.018, 0.008],
    [0.015, 0.002, 0.018, 0.025, 0.004],
    [0.005, 0.001, 0.008, 0.004, 0.020],
  ];

  // 各资产的配置权重 w_i ∈ [0, 1]
  const w = m.continuous(assets, { lb: 0, ub: 1 });

  // 1. 预算约束: sum(w_i) == 1.0 (100%)
  m.constraint(expr`${sum(assets, (a) => w[a])} == 1.0`, "budget_limit");

  // 2. 预期收益率约束: sum(r_i * w_i) >= 8.5%
  const retMap = Object.fromEntries(assets.map((a, i) => [a, expectedReturns[i]]));
  m.constraint(expr`${dot(retMap, w)} >= ${targetReturn}`, "target_return");

  // 3. 二次目标函数: 最小化风险 w^T * Sigma * w
  let risk = new QuadExpr();
  for (let i = 0; i < assets.length; i++) {
    for (let j = 0; j < assets.length; j++) {
      if (cov[i][j] !== 0) {
        risk = risk.add(w[assets[i]].mul(w[assets[j]]).mul(cov[i][j]));
      }
    }
  }
  m.objective(minimize(risk));

  // 使用 HiGHS 原生凸二次规划引擎求解
  const status = await m.solve();

  console.log(`Status: ${status}`);
  console.log(`Variance: ${m.objectiveValue?.toFixed(6)}`);
  console.log(`Volatility (Std Dev): ${((Math.sqrt(m.objectiveValue || 0)) * 100).toFixed(2)}%`);

  assets.forEach((name) => {
    console.log(`  ${name.padEnd(10)}: ${((w[name].value ?? 0) * 100).toFixed(2)}%`);
  });
}

solvePortfolio();
```

</CodeRunner>
