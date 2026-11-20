## アプローチ

各アイテムの個数を上下限つき整数変数（`0 <= x_i <= maxCounts[i]`）として宣言し、重量制限 `dot(weights, counts) <= maxWeight` のもとで合計価値 `dot(values, counts)` を最大化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} w_i x_i \le W_{\max} \\
& x_i \in \{0, 1, \dots, u_i\} && \forall i
\end{aligned}
$$

## ポイント

- **連続緩和（LP）と整数計画（MIP）の違い**: 決定変数が連続値のままだと、`1.75` 個のように現実にはありえない小数の解が見かけ上高い価値を出してしまいます。整数制約を加えることで実行可能な整数解を厳密に探索します。
- **丸めによる安全な取り出し**: 整数変数でも内部計算の許容誤差により `1.999999999` や `-0` が返ることがあるため、出力時は `Math.round(v.value!) || 0`（Python は `round(pulp.value(c))`）で整数へ正規化すると安全です。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
const counts = input.maxCounts.map((cap, i) =>
  m.integer(`item_${i}`, { lb: 0, ub: cap })
);
m.constraint(
  expr`dot(${input.weights}, ${counts}) <= ${input.maxWeight}`,
  "weight_limit"
);
```

**Python (PuLP)**

```python
counts = [
    pulp.LpVariable(f"item_{i}", lowBound=0, upBound=cap, cat=pulp.LpInteger)
    for i, cap in enumerate(max_counts)
]
prob += pulp.lpDot(weights, counts) <= input_data["maxWeight"]
```
