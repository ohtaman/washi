## アプローチ

各地金 $i$ の投入量 (kg) を連続変数 $x_i$（`amounts[i]`）とし、在庫上限 $A_i$（`availabilities[i]`）のもとで $0 \le x_i \le A_i$ とします。総重量の等式 $\sum_i x_i = B$（`targetBatch`）を課したうえで、各成分 $k$ の含有率 $p_{i,k}$（`compositions[i][k]`）に対する下限 $L_k$（`minRatios[k]`）・上限 $U_k$（`maxRatios[k]`）に $B$ を掛けて絶対量の上下限とし、単価 $c_i$（`costs[i]`）による総材料費を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i = B \\
& L_k B \le \sum_{i=0}^{n-1} p_{i,k} x_i \le U_k B && \forall k \\
& 0 \le x_i \le A_i && \forall i
\end{aligned}
$$

## ポイント

- **両辺に総重量を掛けて割合制約を線形化する**: $\frac{\sum_i p_{i,k} x_i}{\sum_i x_i} \ge L_k$ をそのまま書くと割り算になってしまいますが、等式制約によって総重量 $\sum_i x_i = B$（`targetBatch`）が定数になるため、両辺に $B$ を掛けるだけで純粋な線形計画（LP）に落ちます。（分母も変数になるケースは第 2 章で扱います。）
- **列ベクトルの取り出し**: `compositions[i][k]` は行が地金・列が成分なので、`input.compositions.map((row) => row[k])` で成分 $k$ の列ベクトルを取り出して `dot(...)` に渡します。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

`compositions[i][k]` は行が地金・列が成分のため、列ベクトルを取り出して内積をとり、下限と上限の 2 本の制約をまとめて構築します。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${sum(amounts)} == ${input.targetBatch}`, "total_weight");

m.constraint(
  input.minRatios.flatMap((minRatio, k) => {
    const elemCol = input.compositions.map((row) => row[k]);
    return [
      expr`dot(${elemCol}, ${amounts}) >= ${minRatio * input.targetBatch}`,
      expr`dot(${elemCol}, ${amounts}) <= ${input.maxRatios[k] * input.targetBatch}`,
    ];
  })
);
```

**PuLP (Python)**

```python
prob += pulp.lpSum(amounts) == target_batch

for k in range(n_elem):
    elem_expr = pulp.lpSum(compositions[i][k] * amounts[i] for i in range(n_raw))
    prob += elem_expr >= min_ratios[k] * target_batch
    prob += elem_expr <= max_ratios[k] * target_batch
```
