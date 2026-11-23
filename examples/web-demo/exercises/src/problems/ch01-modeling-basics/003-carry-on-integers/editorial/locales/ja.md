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

- **線形計画（LP）と混合整数線形計画（MILP / MIP）の違い**: どちらも数式は線形（1次式）ですが、LPは決定変数が連続値（小数）をとります。個数や人数など分割できない対象をLPのまま解くと、1.75 個のように現実にはありえない小数の解が見かけ上有利な結果を出してしまいます。そこに整数制約を加えることで、現実的に実行可能な最適解を厳密に探索するのがMILP（MIPとも呼ばれます）です。
- **整数値の取り出し**: PuLP (Python) では許容誤差により `1.999999999` や `-0.0` が返ることがあるため、出力時は `round(pulp.value(c))` で整数へ丸めると安全です。WaSHI では `Integer` / `Binary` 変数の `v.value` は内部で整数へ自動正規化されるため `v.value!` をそのまま使えます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

アイテム数は入力配列の長さによって変わるため、`.map()`（WaSHI）やリスト内包表記（PuLP）で変数配列を動的に作り、各変数に整数型と上界 `ub` / `upBound` を設定します。また、重み配列と変数配列の内積には `dot(...)`（PuLP は `pulp.lpDot(...)`）を使うと、ループを書かずに簡潔に記述できます。

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

**PuLP (Python)**

```python
counts = [
    pulp.LpVariable(f"item_{i}", lowBound=0, upBound=cap, cat=pulp.LpInteger)
    for i, cap in enumerate(max_counts)
]
prob += pulp.lpDot(weights, counts) <= input_data["maxWeight"]
```
