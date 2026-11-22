## Approach

個別の整数上限（`[0, maxCounts[i]]`）を持つ整数決定変数を宣言し、等式制約 `dot(denominations, counts) == targetAmount` を課したうえで `sum(counts)` を最小化します。

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} d_i x_i = T \\
& x_i \in \{0, 1, \dots, u_i\} && \forall i
\end{aligned}
$$

## Key Points

- **整数変数と連続変数**: 連続変数（LP緩和）のままだと、`1.5` 枚のような小数の硬貨が許されてしまいます。`m.integer`（`pulp.LpInteger`）を使うことで混合整数計画問題（**MIP**）となり、整数枚数のみが許されます。
- **貪欲法が最適にならない理由**: 額面 `[1, 3, 4]` で目標 `6` を作る場合、大きい硬貨から順に選ぶと `4 + 1 + 1`（3枚）になりますが、最適解 `3 + 3` はわずか2枚で済みます。
- **安全な整数取り出し**: ソルバーの数値誤差により `1.999999999` や `-0` が返ることがあるため、`Math.round(v.value!) || 0`（Python では `round(pulp.value(c))`）で正規化します。
- 関連用語: [ガイド＆用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)。

## Key Implementation

**WaSHI (TypeScript)**

```ts
const counts = input.maxCounts.map((cap, i) =>
  m.integer(`coin_${i}`, { lb: 0, ub: cap })
);
m.constraint(
  expr`dot(${input.denominations}, ${counts}) == ${input.targetAmount}`,
  "exact_target"
);
m.objective(minimize(expr`sum(${counts})`));
```

**PuLP (Python)**

```python
counts = [
    pulp.LpVariable(f"coin_{i}", lowBound=0, upBound=cap, cat=pulp.LpInteger)
    for i, cap in enumerate(max_counts)
]
prob += pulp.lpDot(denominations, counts) == target_amount
prob += pulp.lpSum(counts)
```
