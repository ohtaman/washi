## アプローチ

各ヒーローペア $(i_k, j_k)$ に対して積 $x_{i_k} x_{j_k}$ を表す補助変数 $w_k \in [0, 1]$ を用意し、予算上限・人数上限に加えて 3 本の McCormick 不等式（$w_k \le x_{i_k}$, $w_k \le x_{j_k}$, $w_k \ge x_{i_k} + x_{j_k} - 1$）を課すことで、正のシナジーボーナスも負の対立ペナルティも厳密に線形化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} p_i x_i + \sum_{k=0}^{P-1} s_k w_k \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} c_i x_i \le B \\
& \sum_{i=0}^{n-1} x_i \le K \\
& w_k \le x_{i_k}, \quad w_k \le x_{j_k}, \quad w_k \ge x_{i_k} + x_{j_k} - 1 && \forall k \in \{0, \dots, P-1\} \\
& x_i \in \{0, 1\}, \quad 0 \le w_k \le 1 && \forall i, k
\end{aligned}
$$

## ポイント

- **正負両方の $s_k$ で 3 本すべてが不可欠になる理由**: シナジーペア（$s_k > 0$）では最大化が $w_k$ を引き上げようとするため $w_k \le x_{i_k}, w_k \le x_{j_k}$ が必須です。逆に対立ペア（$s_k < 0$）では最大化が $w_k$ を $0$ に下げようとするため、$w_k \ge x_{i_k} + x_{j_k} - 1$ を省くと両方採用しても $w_k = 0$ にしてペナルティを回避できてしまいます。
- **連続変数でも 0-1 に定まる**: $x_{i_k}, x_{j_k} \in \{0, 1\}$ であるため、$0 \le w_k \le 1$ と 3 本の不等式だけで $w_k$ は自動的に $0$ または $1$ に一意に決まります。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
m.constraint(expr`sum(${selected}) <= ${input.maxPartySize}`, "party_size");
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
prob += pulp.lpDot(costs, selected) <= budget
prob += pulp.lpSum(selected) <= max_party_size
for k, (i, j, _) in enumerate(pairs):
    prob += pair_products[k] <= selected[i]
    prob += pair_products[k] <= selected[j]
    prob += pair_products[k] >= selected[i] + selected[j] - 1
```
