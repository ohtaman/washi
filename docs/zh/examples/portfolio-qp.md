# 投资组合优化 (凸二次规划 QP)

| 问题类别 | 求解器 | 核心 API | 链接 |
| :--- | :--- | :--- | :--- |
| 凸二次规划 (Convex QP) | HiGHS (默认) | `m.continuous()`, `m.constraint()`, `expr`, `minimize`, `dot`, `QuadExpr` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=portfolio_qp">在演练场中打开</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts">源代码</a></li></ul> |

马科维茨均值-方差模型是量化金融中的经典优化问题。在满足最低预期收益率与 100% 资金预算约束的前提下，将资金分配至各类风险资产，以最小化投资组合方差 $\mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w}$。

<PortfolioQpDemo />

## 数学模型

设资产数量为 $n$，资产 $i$ 的配置权重为 $w_i$（向量记作 $\mathbf{w}$），预期收益率为 $r_i$，目标最低预期收益率为 $R_{\text{target}}$：

$$\begin{aligned}
\text{Minimize} \quad & \mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w} & (\text{投资组合方差}) \\
\text{Subject to} \quad & \sum_{i=1}^n w_i = 1 & (\text{100\% 资金预算约束}) \\
& \sum_{i=1}^n r_i w_i \ge R_{\text{target}} & (\text{最低目标预期收益率}) \\
& 0 \le w_i \le 1 \quad \forall i = 1, \dots, n & (\text{仅做多权重约束，禁止做空})
\end{aligned}$$

其中 $\boldsymbol{\Sigma}$ 为对称半正定的资产收益率协方差矩阵，从而使目标函数成为凸二次函数。

## WaSHI 实现

<CodeRunner preset="portfolio_qp">

```typescript
import { Model, QuadExpr, dot, minimize, expr } from "@ohtaman/washi";

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
  m.constraint(expr`sum(${w}) == 1.0`, "budget_limit");

  // 2. 预期收益率约束: sum(r_i * w_i) >= 8.5%
  const retMap = Object.fromEntries(assets.map((a, i) => [a, expectedReturns[i]]));
  const portfolioReturn = dot(retMap, w);
  m.constraint(expr`${portfolioReturn} >= ${targetReturn}`, "target_return");

  // 3. 二次目标函数: 最小化投资组合方差 w^T * Sigma * w
  let risk = new QuadExpr();
  for (let i = 0; i < assets.length; i++) {
    for (let j = 0; j < assets.length; j++) {
      if (cov[i][j] !== 0) {
        risk = risk.add(w[assets[i]].mul(w[assets[j]]).mul(cov[i][j]));
      }
    }
  }
  m.objective(minimize(risk));

  // 使用 HiGHS 的 QP 求解器求解
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

## 实战要点

### 描绘有效前沿

求解后的 `portfolioReturn.value` 恰好等于 `targetReturn`（`8.50%`），说明目标预期收益率约束在等号处紧绑定，所得解位于 `8.50%` 对应的马科维茨有效前沿上。将 `targetReturn` 从最小方差投资组合的预期收益率（约 `4.52%`）扫描至最高单一资产收益率（`12%`），即可绘出完整的有效前沿。

### 目标收益约束与风险厌恶系数标量化

在禁止做空（$0 \le w_i \le 1$）条件下，若 `targetReturn` 高于最高单一资产收益率（`Tech` 为 `12%`），硬约束会导致模型返回 `"Infeasible"`。

若希望移除硬目标收益率约束、使模型对任意风险厌恶系数 $\lambda > 0$ 始终可行，可使用预期收益率向量 $\mathbf{r}$ 最小化如下风险调整目标函数：

$$\min_{\mathbf{w}} \; \lambda \, \mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w} - \mathbf{r}^T \mathbf{w}$$
