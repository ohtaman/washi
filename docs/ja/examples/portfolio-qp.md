# ポートフォリオ最適化 (凸二次計画 QP)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 凸二次計画問題 (Convex QP) | HiGHS (標準) | `m.continuous()`, `m.constraint()`, `expr`, `minimize`, `dot`, `QuadExpr` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=portfolio_qp">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts">ソースコード</a></li></ul> |

マーコウィッツの平均・分散モデルに基づき、目標期待リターンと投資比率合計（100%）の制約を満たしながら、資産間の共分散行列から計算されるポートフォリオ全体の分散（リスク $\mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w}$）を最小化します。

<PortfolioQpDemo />

## 数理定式化

各資産 $i$ への投資ウェイトを $w_i \ge 0$ とします。

$$\begin{aligned}
\text{Minimize} \quad & \mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w} & (\text{ポートフォリオ分散の最小化}) \\
\text{Subject to} \quad & \sum_{i=1}^n w_i = 1 & (\text{投資予算 100\%}) \\
& \sum_{i=1}^n r_i w_i \ge R_{\text{target}} & (\text{目標期待リターン以上}) \\
& 0 \le w_i \le 1 & (\text{空売りなし条件})
\end{aligned}$$

ここで $\boldsymbol{\Sigma}$ は半正定値の共分散行列です。

## WaSHI による実装

<CodeRunner preset="portfolio_qp">

```typescript
import { Model, QuadExpr, sum, dot, minimize, expr } from "@ohtaman/washi";

async function solvePortfolio() {
  const m = new Model("PortfolioQP");

  const assets = ["Tech", "Bonds", "GlobalEq", "RealEstate", "Gold"];
  const expectedReturns = [0.12, 0.04, 0.09, 0.07, 0.05];
  const targetReturn = 0.085; // 目標期待リターン 8.5%

  // 5×5 共分散行列
  const cov = [
    [0.040, 0.002, 0.025, 0.015, 0.005],
    [0.002, 0.005, 0.003, 0.002, 0.001],
    [0.025, 0.003, 0.030, 0.018, 0.008],
    [0.015, 0.002, 0.018, 0.025, 0.004],
    [0.005, 0.001, 0.008, 0.004, 0.020],
  ];

  // 各資産への投資ウェイト w_i in [0, 1]
  const w = m.continuous(assets, { lb: 0, ub: 1 });

  // 1. 予算制約: sum(w_i) == 1.0 (100%)
  m.constraint(expr`${sum(assets, (a) => w[a])} == 1.0`, "budget_limit");

  // 2. 目標リターン制約: sum(r_i * w_i) >= 8.5%
  const retMap = Object.fromEntries(assets.map((a, i) => [a, expectedReturns[i]]));
  m.constraint(expr`${dot(retMap, w)} >= ${targetReturn}`, "target_return");

  // 3. 二次目的関数: リスク w^T * Sigma * w の最小化
  let risk = new QuadExpr();
  for (let i = 0; i < assets.length; i++) {
    for (let j = 0; j < assets.length; j++) {
      if (cov[i][j] !== 0) {
        risk = risk.add(w[assets[i]].mul(w[assets[j]]).mul(cov[i][j]));
      }
    }
  }
  m.objective(minimize(risk));

  // HiGHS の凸二次計画エンジンで求解
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
