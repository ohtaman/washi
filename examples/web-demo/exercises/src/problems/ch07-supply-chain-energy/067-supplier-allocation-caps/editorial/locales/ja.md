## アプローチ

サプライヤー採用を表す 0-1 変数 $y_s$ と、各工場へのシェア上限をそのまま上界に入れた連続発注量 $q_{s,p} \in [0, \alpha D_p]$ を用意し、サプライヤーごとの総発注量に対する半連続制約と全体の採用社数上下限を課して総コストを最小化します。

## 数理モデル

$$
\begin{aligned}
\min_{y \in \{0,1\}^S,\; q \ge 0} \quad & \sum_{s=0}^{S-1} F_s y_s + \sum_{s=0}^{S-1} \sum_{p=0}^{P-1} c_{s,p} q_{s,p} \\
\text{s.t.} \quad & K_{\min} \le \sum_{s=0}^{S-1} y_s \le K_{\max} \\
& L_s y_s \le \sum_{p=0}^{P-1} q_{s,p} \le U_s y_s && \forall s \\
& \sum_{s=0}^{S-1} q_{s,p} \ge D_p && \forall p \\
& 0 \le q_{s,p} \le \alpha D_p && \forall s, p
\end{aligned}
$$

ここで $F_s$（`fixedCosts[s]`）、$c_{s,p}$（`unitCosts[s][p]`）、$L_s$（`minOrders[s]`）、$U_s$（`maxOrders[s]`）、$D_p$（`demands[p]`）、$\alpha$（`maxShare`）、$K_{\min}, K_{\max}$（`minSuppliers`, `maxSuppliers`）は各入力フィールドに対応します。

## ポイント

- **シェア上限は変数の上界だけで表現可能**: $q_{s,p} \le \alpha D_p$ を変数宣言の `ub` に設定すれば $S \times P$ 本の制約行を増やさずにリスク分散を表現でき、各工場で最低 $\lceil 1 / \alpha \rceil$ 社からの分散調達が自動的に保証されます。
- **サプライヤー単位の半連続リンク**: $L_s y_s \le \sum_p q_{s,p} \le U_s y_s$ と $q_{s,p} \ge 0$ により、不採用（$y_s = 0$）なら全工場への配分がゼロに、採用（$y_s = 1$）なら合計発注量が $[L_s, U_s]$ に強制されます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

シェア上限を変数宣言時の上界 `ub` に組み込んだ上で、採用社数の上下限とサプライヤーごとの半連続発注量制約（最小発注量と最大供給能力）を追加します。WaSHI では `m.continuous` のオプションで `ub` を指定し、`forEach` で各サプライヤーの総発注量制約を構築します。

**WaSHI (TypeScript)**

```ts
const allocations = input.fixedCosts.map((_, s) =>
  input.demands.map((demand, p) =>
    m.continuous(`q_${s}_${p}`, { lb: 0, ub: input.maxShare * demand })
  )
);
m.constraint(expr`${sum(active)} >= ${input.minSuppliers}`);
m.constraint(expr`${sum(active)} <= ${input.maxSuppliers}`);
allocations.forEach((row, s) => {
  const totalOrder = sum(row);
  m.constraint(expr`${totalOrder} >= ${input.minOrders[s]} * ${active[s]}`);
  m.constraint(expr`${totalOrder} <= ${input.maxOrders[s]} * ${active[s]}`);
});
```

**PuLP (Python)**

```python
allocations = [
    [
        pulp.LpVariable(f"q_{s}_{p}", lowBound=0, upBound=max_share * demands[p])
        for p in range(n_plants)
    ]
    for s in range(n_sup)
]
prob += pulp.lpSum(active) >= min_suppliers
prob += pulp.lpSum(active) <= max_suppliers
for s in range(n_sup):
    total_order = pulp.lpSum(allocations[s])
    prob += total_order >= min_orders[s] * active[s]
    prob += total_order <= max_orders[s] * active[s]
```
