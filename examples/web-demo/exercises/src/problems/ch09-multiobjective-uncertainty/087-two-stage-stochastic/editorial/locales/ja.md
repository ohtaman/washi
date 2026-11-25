## アプローチ

全シナリオ共通の第 1 段階発注変数 `orders`（$x_j \ge 0$）と、シナリオ別の第 2 段階リコース変数 `shortage`（$u_{s,j} \ge 0$）・`leftover`（$v_{s,j} \ge 0$）を導入して確定的等価 LP を構築します。`orderCosts`・`shortageCosts`・`salvageValues`・`warehouseCap` をそれぞれ $c_j, q_j, r_j, W_{\text{cap}}$ で表し、収支等式 $x_j + u_{s,j} - v_{s,j} = d_{s,j}$ のもとで確率重み $p_s$ 付きの期待総費用を最小化します。

## 数理モデル

$$
\begin{aligned}
\min_{x, u, v \ge 0} \quad & \sum_{j=0}^{n-1} c_j x_j + \sum_{s=0}^{S-1} p_s \sum_{j=0}^{n-1} \left( q_j u_{s,j} - r_j v_{s,j} \right) \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} x_j \le W_{\text{cap}} \\
& x_j + u_{s,j} - v_{s,j} = d_{s,j} && \forall s \in \{0, \dots, S-1\},\; j \in \{0, \dots, n-1\}
\end{aligned}
$$

## ポイント

- **確率解の価値（VSS: Value of the Stochastic Solution）**: 平均需要 $\bar{d}_j = \sum_s p_s d_{s,j}$ に置き換えた決定論的モデルでは欠品費と残存回収の非対称性や倉庫配分優先度を見誤り、期待総コストが高くなります（Case 0 で 196.5 対 184）。
- **非予見性と相補性**: 第 1 段階変数 $x_j$ を全シナリオで共有することで「未来を知らずに今決める」非予見性を表し、また $q_j > r_j$ により最適解では同一 $(s, j)$ で欠品と余剰が同時に正になりません。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

第 1 段階の発注量 `orders` を全シナリオで共有しつつ、`input.demands.flatMap(...)` で各シナリオの収支等式を一括登録し、`input.probs.map(...)` で期待第 2 段階コストを組み立てます。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`sum(${orders}) <= ${input.warehouseCap}`, "warehouse_cap");
m.constraint(
  input.demands.flatMap((row, s) =>
    row.map((d, j) => expr`${orders[j]} + ${shortage[s][j]} - ${leftover[s][j]} == ${d}`)
  )
);
const stage2Expected = sum(
  input.probs.map((p, s) =>
    expr`${p} * (dot(${input.shortageCosts}, ${shortage[s]}) - dot(${input.salvageValues}, ${leftover[s]}))`
  )
);
m.objective(minimize(expr`dot(${input.orderCosts}, ${orders}) + ${stage2Expected}`));
```

**PuLP (Python)**

```python
prob += pulp.lpSum(orders) <= warehouse_cap
for s in range(S):
    for j in range(n):
        prob += orders[j] + shortage[s][j] - leftover[s][j] == demands[s][j]
stage2_expected = pulp.lpSum(
    probs[s] * (pulp.lpDot(shortage_costs, shortage[s]) - pulp.lpDot(salvage_values, leftover[s]))
    for s in range(S)
)
prob += pulp.lpDot(order_costs, orders) + stage2_expected
```
