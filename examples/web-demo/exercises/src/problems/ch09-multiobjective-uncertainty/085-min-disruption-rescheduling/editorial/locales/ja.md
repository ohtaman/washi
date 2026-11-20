## アプローチ

0-1 の割当変数 $x_{it}$ に対して勤務不可セルを $x_{it} = 0$ に固定し、各時間帯の必要人数等式とスタッフごとの上限回数を課したうえで、定数である基準シフト $x^{\text{base}}_{it} \in \{0, 1\}$ とのハミング距離を補助変数なしの 1 次式で表して最小化します。

## 数理モデル

$$
\begin{aligned}
\min_{x \in \{0,1\}^{m \times T}} \quad & W \sum_{i,t} \left((1 - x^{\text{base}}_{it}) x_{it} + x^{\text{base}}_{it}(1 - x_{it})\right) + \sum_{i,t} c_i x_{it} \\
\text{s.t.} \quad & x_{it} = 0 && \forall (i,t):\; u_{it} = 1 \\
& \sum_{i=0}^{m-1} x_{it} = D_t && \forall t \in \{0, \dots, T-1\} \\
& \sum_{t=0}^{T-1} x_{it} \le S_i && \forall i \in \{0, \dots, m-1\}
\end{aligned}
$$

## ポイント

- **定数基準とのハミング距離は補助変数不要で線形化できる**: $x^{\text{base}}_{it}$ が入力定数（`0` または `1`）であるため、$|x_{it} - x^{\text{base}}_{it}|$ は $x^{\text{base}}_{it} = 0$ のとき $x_{it}$、$1$ のとき $1 - x_{it}$ という純粋な線形項になり、絶対値補助変数を増やす必要がありません。
- **連鎖スワップと安定性トレードオフ**: 個人の最大勤務回数 `maxShifts` がタイトな場合は 1 人の欠員が玉突き交代を引き起こし、`disruptionWeight` の大小によって「変更ゼロ維持（Case 2）」と「安価なスタッフへの乗換（Case 4）」が切り替わります。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [基本要素](?view=guide&lang=ja#building-blocks)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
const hammingExpr = sum(
  x.flatMap((row, i) =>
    row.map((v, t) => {
      const b = input.baseline[i][t];
      return expr`(1 - ${b}) * ${v} + ${b} * (1 - ${v})`;
    })
  )
);
const assignCostExpr = sum(x.map((row, i) => expr`${input.workerCosts[i]} * ${sum(row)}`));
m.objective(minimize(expr`${input.disruptionWeight} * ${hammingExpr} + ${assignCostExpr}`));
```

**PuLP (Python)**

```python
hamming_expr = pulp.lpSum(
    (1 - baseline[i][t]) * x[i][t] + baseline[i][t] * (1 - x[i][t])
    for i in range(m_workers)
    for t in range(n_slots)
)
assign_expr = pulp.lpSum(
    worker_costs[i] * x[i][t] for i in range(m_workers) for t in range(n_slots)
)
prob += disruption_weight * hamming_expr + assign_expr
```
