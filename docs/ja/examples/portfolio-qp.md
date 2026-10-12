# ポートフォリオ最適化 (凸二次計画 QP)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 凸二次計画問題 (Convex QP) | HiGHS (標準) | `new QuadExpr()`, `v1.mul(v2)`, `sum()` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=portfolio_qp">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts">ソースコード</a></li></ul> |

マーコウィッツの平均・分散モデルに基づき、目標期待リターンと投資比率合計（100%）の制約を満たしながら、資産間の共分散行列から計算されるポートフォリオ全体の分散（リスク $w^T \Sigma w$）を最小化します。

<PortfolioQpDemo />

## WaSHI による実装

<CodeRunner preset="portfolio_qp">

```typescript
import { Model, QuadExpr, sum } from "@ohtaman/washi";

async function runPortfolioQP() {
  const m = new Model({ name: "MarkowitzPortfolio", sense: "Minimize" });

  const assets = ["Tech", "Bonds", "RealEstate"];
  const returns = [0.14, 0.04, 0.08];

  // 各資産への投資ウェイト (0.0 〜 1.0)
  const w = assets.map((a) => m.addVar({ name: `w_${a}`, lb: 0, ub: 1 }));

  // 1. 予算制約: ウェイト合計 == 1.0 (100%)
  m.addConstraint(sum(w).eq(1.0), "budget");

  // 2. 目標リターン制約: 期待リターン >= 8.5%
  m.addConstraint(sum(w.map((v, i) => v.mul(returns[i]))).ge(0.085), "min_return");

  // 3. 共分散行列に基づくリスク（二次式 w^T * Cov * w）の最小化
  const cov = [
    [0.040, 0.002, 0.015],
    [0.002, 0.005, 0.002],
    [0.015, 0.002, 0.025],
  ];

  let risk = new QuadExpr();
  for (let i = 0; i < assets.length; i++) {
    for (let j = 0; j < assets.length; j++) {
      risk = risk.add(w[i].mul(w[j]).mul(cov[i][j]));
    }
  }
  m.minimize(risk);

  const status = await m.solve();
  console.log(`Status: ${status}, Minimal Variance: ${m.objectiveValue?.toFixed(6)}`);
  assets.forEach((name, i) => {
    console.log(`  ${name.padEnd(10)}: ${((w[i].value ?? 0) * 100).toFixed(2)}%`);
  });
}

runPortfolioQP();
```

</CodeRunner>
