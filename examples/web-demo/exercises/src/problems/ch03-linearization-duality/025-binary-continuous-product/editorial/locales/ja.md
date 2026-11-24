## アプローチ

0-1 変数 $b_i \in \{0, 1\}$ と有界連続変数 $x_i \in [L_i, U_i]$ の積 $b_i x_i$ を表す補助連続変数 $z_i$ を用意し、4 本の Glover / McCormick 不等式で $b_i = 0$ のとき $z_i = 0$（ただし $x_i \ge L_i > 0$ はそのまま可）、$b_i = 1$ のとき $z_i = x_i$ を厳密に表現します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \left(c_i x_i + F_i b_i - d_i z_i\right) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i \ge \text{totalDemand} \\
& L_i b_i \le z_i \le U_i b_i && \forall i \in \{0, \dots, n-1\} \\
& x_i - U_i (1 - b_i) \le z_i \le x_i - L_i (1 - b_i) && \forall i \\
& L_i \le x_i \le U_i, \quad b_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## ポイント

- **稼働ゲート $x_i \le U_i b_i$ との違い**: この問題では割引契約を結ばない場合（$b_i = 0$）でも通常価格で $x_i \ge L_i > 0$ を購入できます。オフになるのは $x_i$ ではなく積 $z_i = b_i x_i$ だけである点に注意してください。
- **厳密な凸包表現**: 4 本の不等式 $L_i b_i \le z_i \le U_i b_i$ および $x_i - U_i(1-b_i) \le z_i \le x_i - L_i(1-b_i)$ は $b_i \in \{0, 1\}, x_i \in [L_i, U_i]$ 上の積の凸包（最もタイトな線形緩和）を与えます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

総需要の下限制約を登録し、各サプライヤについて Glover / McCormick の 4 本の不等式を `flatMap` で展開して `m.constraint([...])` にまとめて渡します。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${sum(x)} >= ${input.totalDemand}`, "total_demand");
m.constraint(
  input.minOrders.flatMap((L, i) => {
    const U = input.maxOrders[i];
    return [
      expr`${z[i]} >= ${L} * ${b[i]}`,
      expr`${z[i]} <= ${U} * ${b[i]}`,
      expr`${z[i]} >= ${x[i]} - ${U} * (1 - ${b[i]})`,
      expr`${z[i]} <= ${x[i]} - ${L} * (1 - ${b[i]})`,
    ];
  })
);
```

**PuLP (Python)**

```python
prob += pulp.lpSum(x) >= demand
for i in range(n):
    L, U = min_ord[i], max_ord[i]
    prob += z[i] >= L * b[i]
    prob += z[i] <= U * b[i]
    prob += z[i] >= x[i] - U * (1 - b[i])
    prob += z[i] <= x[i] - L * (1 - b[i])
```
