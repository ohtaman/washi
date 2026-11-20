## アプローチ

1 次元ビンパッキングを使用フラグ `used[k]` と割当行列 `assign[i][k]` で表し、先頭詰め対称性除去（`used[k] >= used[k+1]`、および $k > i$ で `assign[i][k] = 0`）を加えます。さらに切り上げ総容量カット $\sum_k y_k \ge \lceil \sum_i w_i / B \rceil$ と拡張極小カバー不等式を追加して LP 緩和を強化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{k=0}^{n-1} y_k \\
\text{s.t.} \quad & \sum_{k=0}^{n-1} x_{ik} = 1, \quad x_{ik} = 0 \; (\forall k > i), \quad y_k \ge y_{k+1} \\
& \sum_{i=0}^{n-1} w_i x_{ik} \le B y_k && \forall k \\
& \sum_{k=0}^{n-1} y_k \ge \left\lceil \frac{1}{B} \sum_{i=0}^{n-1} w_i \right\rceil \\
& \sum_{i \in E(C)} x_{ik} \le (|C| - 1) y_k && \forall k, \; \forall \text{ 極小カバー } C \\
& x_{ik}, y_k \in \{0, 1\}
\end{aligned}
$$

ここで $E(C) = C \cup \{j : w_j \ge \max_{i \in C} w_i\}$ は $C$ の拡張カバーです。

## ポイント

- **対称性除去**: 順序制約がないと、$m$ 個のビンを使う解には $m!$ 通りの同値な置換が生じます。$k > i$ のとき $x_{ik} = 0$（これにより品目 0 は必ずビン 0 に入る）および $y_k \ge y_{k+1}$ を課すことで、最適値を変えずに冗長な探索枝を排除できます。
- **拡張極小カバー不等式**: $\sum_{i \in C} w_i > B$ かつ $\sum_{i \in C} w_i - \min_{i \in C} w_i \le B$ を満たす極小カバー $C$ に対し、最大要素以上に重い品目を加えた $E(C)$ からはどのビンにも高々 $|C| - 1$ 個しか入りません。
- **LP 緩和の強化**: 2 個の共存不可ペア（$w_i + w_j > B$）や 3 個の拡張カバー、総容量切り上げカットを組み合わせることで、弱い分数緩和値（`[6,6,6,2]` や `[4,4,4,4,4]` での `2.0`）を大きく引き上げられます。
- 用語の確認: [ガイド・用語集 — 代表的な問題クラス](?view=guide&lang=ja#paradigms) / [モデルの基本構成要素](?view=guide&lang=ja#building-blocks)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
for (let k = 0; k < n - 1; k++) {
  m.constraint(expr`${used[k]} >= ${used[k + 1]}`, `sym_order_${k}`);
}
m.constraint(expr`sum(${used}) >= ${Math.ceil(totalWeight / input.binCapacity)}`, "global_cap");
for (const cut of buildExtendedCovers(input.weights, input.binCapacity)) {
  for (let k = 0; k < n; k++) {
    m.constraint(expr`sum(${cut.items.map((i) => assign[i][k])}) <= ${cut.rhsMult} * ${used[k]}`);
  }
}
await m.relax();
const lpBound = m.objectiveValue!;
await m.solve();
```

**PuLP (Python)**

```python
for k in range(n - 1):
    prob += used[k] >= used[k + 1]
prob += pulp.lpSum(used) >= math.ceil(sum(weights) / bin_cap)
for ext, rhs_mult in covers:
    for k in range(n):
        prob += pulp.lpSum(assign[i][k] for i in ext) <= rhs_mult * used[k]
```
