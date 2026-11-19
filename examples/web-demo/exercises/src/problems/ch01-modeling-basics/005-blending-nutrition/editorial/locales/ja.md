## アプローチ

各原料の投入量を在庫上限つき連続変数（`0 <= x_i <= availabilities[i]`）として宣言し、総重量の等式 `sum(amounts) == targetBatch` と元素ごとの絶対量上下限を加え、総材料費を最小化します。

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

- **分母払いで割合制約を線形化する**: $\frac{\sum_i p_{i,k} x_i}{\sum_i x_i} \ge L_k$ をそのまま書くと割り算になってしまいますが、等式制約によって総重量 $\sum_i x_i = B$（`targetBatch`）が定数になるため、両辺に $B$ を掛けるだけで純粋な線形計画（LP）に落ちます。（分母も変数になるケースは第 2 章で扱います。）
- **列ベクトルの取り出し**: `compositions[i][k]` は行が原料・列が元素なので、`input.compositions.map((row) => row[k])` で元素 $k$ の列ベクトルを取り出して `dot(...)` に渡します。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

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

**Python (highspy)**

```python
h.addConstr(h.qsum(amounts) == target)

for k in range(n_elem):
    elem_expr = h.qsum(compositions[i][k] * amounts[i] for i in range(n_raw))
    h.addConstr(elem_expr >= min_ratios[k] * target)
    h.addConstr(elem_expr <= max_ratios[k] * target)
```
