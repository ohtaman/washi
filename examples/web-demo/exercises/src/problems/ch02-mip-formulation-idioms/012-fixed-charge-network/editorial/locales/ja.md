## アプローチ

$S \times D$ の 0-1 行列 `open` と連続変数行列 `shipments` を用意し、各枝に `shipments[i][j] <= capacities[i][j] * open[i][j]` を課したうえで、供給上限・需要下限のもとで固定費と輸送費の合計を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{S-1} \sum_{j=0}^{D-1} \left( F_{i,j} y_{i,j} + c_{i,j} x_{i,j} \right) \\
\text{s.t.} \quad & 0 \le x_{i,j} \le C_{i,j} y_{i,j} && \forall i, j \\
& \sum_{j=0}^{D-1} x_{i,j} \le S_i && \forall i \\
& \sum_{i=0}^{S-1} x_{i,j} \ge D_j && \forall j \\
& y_{i,j} \in \{0, 1\} && \forall i, j
\end{aligned}
$$

## ポイント

- **通常輸送（LP）からの変化**: 固定費 $F_{i,j} y_{i,j}$ が加わることでルート集約のインセンティブが生まれ、1 単位あたりの輸送費が最安のルートであっても固定費が高ければ採用されないケースが生じます。
- **枝ごとのタイトな容量連結**: 任意の巨大な定数ではなくルート固有の上限 $C_{i,j}$ を $y_{i,j}$ に掛けることで、LP 緩和がタイトになり、かつ `capacities[i][j] = 0` の使用不可ルートも自然に遮断されます。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

すべての産地集荷場・スーパーのペアについて輸送量 `shipments[i][j]` を積載容量 `capacities[i][j] * open[i][j]` 以下に抑え、目的関数では契約固定費と変動輸送費の和を最小化します。

**WaSHI (TypeScript)**

```ts
m.constraint(
  shipments.flatMap((row, i) =>
    row.map((flow, j) => expr`${flow} <= ${input.capacities[i][j]} * ${open[i][j]}`)
  )
);
m.objective(
  minimize(expr`dot(${input.fixedCosts}, ${open}) + dot(${input.unitCosts}, ${shipments})`)
);
```

**PuLP (Python)**

```python
for i in range(n_s):
    for j in range(n_d):
        prob += shipments[i][j] <= capacities[i][j] * open_vars[i][j]
prob += pulp.lpSum(
    fixed_costs[i][j] * open_vars[i][j] + unit_costs[i][j] * shipments[i][j]
    for i in range(n_s) for j in range(n_d)
)
```
