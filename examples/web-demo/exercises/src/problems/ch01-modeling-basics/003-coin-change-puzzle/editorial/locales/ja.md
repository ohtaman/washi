## アプローチ

各硬貨 $i \in \{0, \dots, n-1\}$ の額面を $d_i$（`denominations[i]`）、所持上限を $u_i$（`maxCounts[i]`）、目標金額を $T$（`targetAmount`）とし、硬貨 $i$ の使用枚数を表す整数決定変数 $x_i \in \{0, 1, \dots, u_i\}$ を定義します。合計金額が目標金額に一致する等式制約のもとで、使用枚数の総和を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} d_i x_i = T \\
& x_i \in \{0, 1, \dots, u_i\} && \forall i
\end{aligned}
$$

## ポイント

- **整数変数と連続変数**: 連続変数（LP緩和）のままだと、1.5 枚のような小数の硬貨が許されてしまいます。`m.integer`（`pulp.LpInteger`）を使うことで混合整数計画問題（**MIP**）となり、整数枚数のみが許されます。
- **貪欲法が最適にならない理由**: 額面 `[1, 3, 4]` で目標金額 6 を作る場合、大きい硬貨から順に選ぶと $4 + 1 + 1$（3 枚）になりますが、最適解 $3 + 3$ はわずか 2 枚で済みます。
- **安全な整数取り出し**: WaSHI では `Integer` / `Binary` 変数の解（`v.value!`）が自動的に正確な整数へ正規化されます（−0 も 0 に正規化されます）が、整数の合計値が期待される場面では `m.objectiveValue!` を丸めておくと安心です。一方、PuLP の `pulp.value(...)` はソルバーの微小な数値誤差（1.999999999 など）を含み得る `float` を返すため、`round(...)` で整数化します。
- 関連用語: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [代表的な問題クラス](?view=guide&lang=ja#paradigms)。

## 実装の勘所

各硬貨の使用枚数を 0 以上・上限枚数以下の整数変数として宣言し、合計金額の等式制約と合計枚数の最小化目的を設定します。

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
