## アプローチ

0-1 配備変数 $x_i \in \{0, 1\}$ 上に、ゾーン負荷 $L_r = \sum_{i=0}^{n-1} a_{ri} x_i$（$a_{ri} = \text{loads}[r][i]$）およびペア $k = (i_k, j_k, s_k)$ に対して、第 3 章で学んだ 3 つの線形化定石——エピグラフ最大負荷変数 $t \ge L_r$、L1 目標偏差変数 $d_r^+ - d_r^- = L_r - \tau_r$、および符号混在ペア相互作用に対する McCormick 線形化 $w_k = x_{i_k} x_{j_k}$——を 1 つの MIP モデルとして統合します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_i x_i + \sum_{k=0}^{P-1} s_k w_k + \alpha \, t + \sum_{r=0}^{m-1} \beta_r (d_r^+ + d_r^-) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} v_i x_i \ge \text{minValue} \\
& L_r = \sum_{i=0}^{n-1} a_{ri} x_i, \qquad L_r \le t, \qquad L_r - \tau_r = d_r^+ - d_r^- && \forall r \in \{0, \dots, m - 1\} \\
& w_k \le x_{i_k}, \quad w_k \le x_{j_k}, \quad w_k \ge x_{i_k} + x_{j_k} - 1 && \forall k \in \{0, \dots, P - 1\} \\
& x_i \in \{0, 1\}, \quad 0 \le w_k \le 1, \quad d_r^+, d_r^- \ge 0 && \forall i, k, r \\
& t \ge 0
\end{aligned}
$$

## ポイント

- **線形化パターンの合成可能性**: $\max_r L_r$、$|L_r - \tau_r|$、$x_i x_j$ という 3 つの非線形構造は、それぞれ独立した補助変数と線形制約のブロックとして互いに干渉せず 1 つのモデルに合成できます。
- **正負両符号のペアに 3 本すべての McCormick 制約が必要**: 相乗効果によるコスト削減（$s_k < 0$）では上界 $w_k \le x_{i_k}, w_k \le x_{j_k}$ が、競合による追加コスト（$s_k > 0$）では下界 $w_k \ge x_{i_k} + x_{j_k} - 1$ が不当な最適化の抜け道を塞ぎます。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

最低価値制約に加え、各ゾーンの負荷に対するエピグラフ上限・L1 偏差分解と、各ペアに対する 3 本の McCormick 不等式を登録します（WaSHI (TypeScript) では `flatMap` で一括登録し、PuLP (Python) ではループで追加します）。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`dot(${input.values}, ${selected}) >= ${input.minValue}`, "min_val");
m.constraint(
  input.loads.flatMap((row, r) => [
    expr`dot(${row}, ${selected}) <= ${peakLoad}`,
    expr`dot(${row}, ${selected}) - ${input.targets[r]} == ${dPlus[r]} - ${dMinus[r]}`,
  ])
);
m.constraint(
  input.pairs.flatMap(([i, j], k) => [
    expr`${pairProducts[k]} <= ${selected[i]}`,
    expr`${pairProducts[k]} <= ${selected[j]}`,
    expr`${pairProducts[k]} >= ${selected[i]} + ${selected[j]} - 1`,
  ])
);
```

**PuLP (Python)**

```python
prob += pulp.lpDot(values, selected) >= min_value
for r in range(m_zones):
    zone_load = pulp.lpDot(loads[r], selected)
    prob += zone_load <= peak_load
    prob += zone_load - targets[r] == d_plus[r] - d_minus[r]
for k, (i, j, _) in enumerate(pairs):
    prob += pair_products[k] <= selected[i]
    prob += pair_products[k] <= selected[j]
    prob += pair_products[k] >= selected[i] + selected[j] - 1
```
