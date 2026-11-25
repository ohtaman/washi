# ポートフォリオ最適化 (凸二次計画 QP)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 凸二次計画問題 (Convex QP) | HiGHS (標準) | `m.continuous()`, `m.constraint()`, `expr`, `minimize`, `dot`, `QuadExpr` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=portfolio_qp">Playground で開く</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts">ソースコード</a></li></ul> |

マーコウィッツの平均・分散モデルを用いた資産配分の最適化問題です。目標期待リターン以上という条件と、投資比率の合計が 100% という制約を満たしながら、ポートフォリオ全体の分散（リスク）を最小化します。

<PortfolioQpDemo />

上のインタラクティブデモは 1 資産あたり `60%` の上限付きプリセットを使いますが、以下の定式化とコードでは上限なしの空売り禁止モデル（$0 \le w_i \le 1$）を解きます。

## 数理モデルの定式化

資産数を $n$、各資産 $i$ の投資比率（ウェイト）を $w_i$（ベクトル表記で $\mathbf{w}$）、期待リターンを $r_i$、目標期待リターンを $R_{\text{target}}$ とします。

$$\begin{aligned}
\text{Minimize} \quad & \mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w} & (\text{ポートフォリオ分散}) \\
\text{Subject to} \quad & \sum_{i=1}^n w_i = 1 & (\text{投資比率の合計 100\%}) \\
& \sum_{i=1}^n r_i w_i \ge R_{\text{target}} & (\text{目標期待リターン以上}) \\
& 0 \le w_i \le 1 \quad \forall i = 1, \dots, n & (\text{空売り禁止制約})
\end{aligned}$$

ここで $\boldsymbol{\Sigma}$ は対称半正定値の共分散行列であり、目的関数は凸二次関数になります。

## WaSHI による実装

<CodeRunner preset="portfolio_qp">

```typescript
import { Model, QuadExpr, dot, minimize, expr } from "@ohtaman/washi";

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
  m.constraint(expr`sum(${w}) == 1.0`, "budget_limit");

  // 2. 目標期待リターン制約: sum(r_i * w_i) >= 8.5%
  const retMap = Object.fromEntries(assets.map((a, i) => [a, expectedReturns[i]]));
  const portfolioReturn = dot(retMap, w);
  m.constraint(expr`${portfolioReturn} >= ${targetReturn}`, "target_return");

  // 3. 二次目的関数: ポートフォリオ分散 w^T * Sigma * w の最小化
  let risk = new QuadExpr();
  for (let i = 0; i < assets.length; i++) {
    for (let j = 0; j < assets.length; j++) {
      if (cov[i][j] !== 0) {
        risk = risk.add(w[assets[i]].mul(w[assets[j]]).mul(cov[i][j]));
      }
    }
  }
  m.objective(minimize(risk));

  // HiGHS の QP ソルバーで求解
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

## 実務上のポイント

目標リターン `8.50%` での最適分散は `0.014229`（ボラティリティ `11.93%`）です。`Tech` の `52.68%` と `Bonds` の `30.57%` でリターンとリスクのバランスを取りつつ、`Tech` と共分散が高い `GlobalEq` は `0.00%` になります。

### 有効フロンティアの描画

求解後の `portfolioReturn.value` は `targetReturn`（`8.50%`）と一致します。これは目標期待リターン制約が等号で成立しており、目標リターン `8.50%` に対応する有効フロンティア上の最小分散解が得られていることを示します。最小分散ポートフォリオの期待リターン（約 `4.52%`）から最大期待リターン（`12%`）までの範囲で `targetReturn` を変化させると、有効フロンティア全体を描けます。

### 目標リターン制約とリスク回避度 $\lambda$ の使い分け

空売り禁止（$0 \le w_i \le 1$）のモデルでは、各資産の中で最も高い期待リターンである `Tech` の `12%` を超える `targetReturn` を指定すると `"Infeasible"` になります。

目標期待リターン制約を外して常に実行可能なモデルにする場合は、期待リターンベクトル $\mathbf{r}$ とリスク回避度 $\lambda > 0$ を用いて次の目的関数を最小化します。

$$\min_{\mathbf{w}} \; \lambda \, \mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w} - \mathbf{r}^T \mathbf{w}$$
