## アプローチ

容量制約付き施設配置を 0-1 MIP 主問題（`open[i]` と第 2 段階推定変数 `theta >= 0`）と連続輸送 LP 子問題に分け、`master.solveBenders` で解きます。候補解 $\bar{y}$ が総容量不足で実行不可能な場合は Phase-I 緩和 LP から Farkas 実行可能性カット（`kind: "feasibility"`）を生成し、実行可能な場合は輸送 LP の双対価格から最適性カット（`kind: "optimality"`）と `subproblemObjective` を返して反復収束させます。

## 数理モデル

$$
\begin{aligned}
\text{(Master)} \quad \min \quad & \sum_{i} f_i y_i + \theta \\
\text{s.t.} \quad & \text{実行可能性カット・最適性カット}, \quad y_i \in \{0, 1\}, \ \theta \ge 0
\end{aligned}
$$

$$
\begin{aligned}
\text{(Sub}(\bar{y})\text{)} \quad \min \quad & \sum_{i,j} c_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{i} x_{ij} \ge d_j && \forall j \quad (\text{双対変数 } \alpha_j \ge 0) \\
& \sum_{j} x_{ij} \le K_i \bar{y}_i && \forall i \quad (\text{双対変数 } \beta_i \le 0), \quad x_{ij} \ge 0
\end{aligned}
$$

## ポイント

- **強双対性に基づく最適性カット**: LP の双対性より $Q(\bar{y}) = \sum_j d_j \alpha_j + \sum_i K_i \beta_i \bar{y}_i$ が成り立つため、すべての $y \in \{0,1\}^I$ に対して有効なカット $\theta - \sum_i K_i \beta_i y_i \ge \sum_j d_j \alpha_j$ が得られます。
- **Phase-I 緩和による実行可能性カット**: 総供給能力が需要未満の候補には Phase-I スラック最小化 LP を解き、その双対 $(\alpha', \beta')$ から厳密な Farkas カット $\sum_i (-K_i \beta'_i) y_i \ge \sum_j d_j \alpha'_j$ を追加します（実行不能時は `subproblemObjective` を渡さず上界を汚染しないのが重要です）。
- **最適輸送量の復元**: `solveBenders` 収束後に得られた最適 `open` を固定して輸送 LP をもう 1 回解くことで、厳密な輸送計画 `shipments` を取得できます。
- 用語の確認: [ガイド・用語集 — 代表的な問題クラス](?view=guide&lang=ja#paradigms) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

`master.solveBenders` の `subproblem` コールバック内で供給能力不足を判定し、不足時は Phase-I 緩和 LP から `kind: "feasibility"` カットを、実行可能時は輸送 LP の双対価格から `kind: "optimality"` カットと `subproblemObjective` を返します。

**WaSHI (TypeScript)**

```ts
const res = await master.solveBenders({
  theta,
  gapTolerance: 1e-5,
  subproblem: async ({ getMasterValue }) => {
    const yBar = open.map((v) => Math.round(getMasterValue(v)) || 0);
    if (sumCap(yBar) < totalDemand - 1e-6) {
      const p1 = buildShippingLp(input, yBar, true);
      await p1.sub.solve();
      const alpha = p1.demCons.map((c) => c.dual ?? 0);
      const beta = p1.capCons.map((c) => c.dual ?? 0);
      return { kind: "feasibility", constraint: expr`${farkasLhs(beta)} >= ${rhs(alpha)}` };
    }
    const p2 = buildShippingLp(input, yBar, false);
    await p2.sub.solve();
    const alpha = p2.demCons.map((c) => c.dual ?? 0);
    const beta = p2.capCons.map((c) => c.dual ?? 0);
    return {
      kind: "optimality",
      constraint: expr`${thetaLhs(theta, beta)} >= ${rhs(alpha)}`,
      subproblemObjective: fixedCost(yBar) + (p2.sub.objectiveValue ?? 0),
    };
  },
});
```
