## アプローチ

Bertsimas-Sim (2004) の予算付き不確実性双対定理を適用します。内部の敵対的最大化 $\max_{0 \le \delta \le 1,\, \sum \delta_j \le \Gamma} \sum_j \hat{a}_j x_j \delta_j$ に対する双対変数 $z \ge 0$・$p_j \ge 0$ を $z + p_j \ge \hat{a}_j x_j$ とともに導入し、容量制約内の最悪上乗せ項を $\Gamma z + \sum_j p_j$ に置き換えて LP として解きます。

## 数理モデル

$$
\begin{aligned}
\max_{x, z, p \ge 0} \quad & \sum_{j=0}^{n-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} \bar{a}_j x_j + \Gamma z + \sum_{j=0}^{n-1} p_j \le b \\
& z + p_j \ge \hat{a}_j x_j && \forall j \in \{0, \dots, n-1\} \\
& 0 \le x_j \le u_j && \forall j
\end{aligned}
$$

## ポイント

- **組合せ爆発なしで小数 $\Gamma$ まで厳密線形化**: $\binom{n}{\Gamma}$ 通りの部分集合を列挙しなくても、連続多面体 $\{0 \le \delta_j \le 1,\; \sum \delta_j \le \Gamma\}$ 上の強双対性により、わずか $n+1$ 個の双対変数と $n$ 本の制約で（Case 3 の $\Gamma = 2.5$ のような小数も含め）厳密に定式化できます。
- **ノミナル（$\Gamma = 0$）から Soyster 最悪保護（$\Gamma = n$）までの連続調整**: $\Gamma = 0$ では高利益（Case 1 で `237.14`）な反面変動に脆く、$\Gamma = n$ では過剰防衛（Case 2 で `172`）になります。中間の $\Gamma$ では上位のリスク露出 $\hat{a}_j x_j$ を均等化するように分散生産されます（Case 0 では全 3 品目が均等に $3$）。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
const z = m.continuous("z", { lb: 0 });
const p = m.continuous(n, { lb: 0, prefix: "p" });
m.constraint(input.deviations.map((dev, j) => expr`${z} + ${p[j]} >= ${dev} * ${x[j]}`));
m.constraint(
  expr`dot(${input.nominalUsages}, ${x}) + ${input.gamma} * ${z} + sum(${p}) <= ${input.capacityCap}`
);
```

**PuLP (Python)**

```python
z = pulp.LpVariable("z", lowBound=0)
p = [pulp.LpVariable(f"p_{j}", lowBound=0) for j in range(n)]
for j in range(n):
    prob += z + p[j] >= deviations[j] * x[j]
prob += pulp.lpDot(nominal, x) + gamma * z + pulp.lpSum(p) <= cap
```
