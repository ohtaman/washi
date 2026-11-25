## アプローチ

焙煎所の開設を決める 0-1 変数 $y_i$（`open[i]`）と出荷量を表す連続変数 $x_{i,j}$（`shipments[i][j]`）を組み、各焙煎所の総出荷量を能力 $C_i$（`capacities[i]`）と連動させて $\sum_j x_{i,j} \le C_i y_i$ と制約しつつ、各カフェ店舗の需要 $d_j$（`demands[j]`）を満たしながら固定運営費 $f_i$（`fixedCosts[i]`）と配送単価 $c_{i,j}$（`unitCosts[i][j]`）による総コストを最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{F-1} f_i y_i + \sum_{i=0}^{F-1} \sum_{j=0}^{D-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{D-1} x_{i,j} \le C_i y_i && \forall i \in \{0, \dots, F-1\} \\
& \sum_{i=0}^{F-1} x_{i,j} \ge d_j && \forall j \in \{0, \dots, D-1\} \\
& x_{i,j} \ge 0,\; y_i \in \{0, 1\} && \forall i, j
\end{aligned}
$$

## ポイント

- **枝単位固定費（#012）との違い**: #012 では輸送ルートごとに 0-1 変数を置きましたが、CFLP では焙煎所ノードに 0-1 変数を置き、その焙煎所からの出荷総和 $\sum_j x_{i,j}$ を $C_i y_i$ に連動させます。
- **LP 緩和を強める妥当不等式**: 配送単価 $c_{i,j} \ge 0$ のもとでは、分解リンク制約 $x_{i,j} \le \min(C_i, d_j) y_i$ を併記しても過剰供給を排除しつつ最適な整数解は保たれます（需要制約を等式 `==` とする場合は整数実行可能解集合そのものが不変です）。これにより根ノードでの分数緩和（$y_i = d_j / C_i$）を防いで分岐を大幅に減らせます。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各焙煎所 `i` の総出荷量を出荷能力 `capacities[i] * open[i]` 以下に抑える連結制約と、各カフェ店舗 `j` の総入荷量が需要を満たす需要充足制約を設定し、固定運営費と配送費の合計を最小化します。

**WaSHI (TypeScript)**

```ts
m.constraint(
  shipments.map((row, i) => expr`${sum(row)} <= ${input.capacities[i]} * ${open[i]}`)
);
m.constraint(
  input.demands.map(
    (demand, j) => expr`${sum(shipments.map((row) => row[j]))} >= ${demand}`
  )
);
m.objective(
  minimize(expr`dot(${input.fixedCosts}, ${open}) + dot(${input.unitCosts}, ${shipments})`)
);
```

**PuLP (Python)**

```python
for i in range(n_f):
    prob += pulp.lpSum(shipments[i][j] for j in range(n_d)) <= capacities[i] * open_vars[i]
for j in range(n_d):
    prob += pulp.lpSum(shipments[i][j] for i in range(n_f)) >= demands[j]
prob += pulp.lpDot(fixed_costs, open_vars) + pulp.lpSum(
    unit_costs[i][j] * shipments[i][j] for i in range(n_f) for j in range(n_d)
)
```
