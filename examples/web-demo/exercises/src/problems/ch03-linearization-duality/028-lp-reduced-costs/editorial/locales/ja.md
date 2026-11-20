## アプローチ

非負変数 $x_j \ge 0$（`lb: 0`、上界なし）で標準の最小化 LP を構築して HiGHS で解き、各変数の被約費用を WaSHI では `v.reducedCost`、PuLP では `v.dj` から読み取ります。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} A_{kj} x_j \ge r_k && [\text{dual } \pi_k \ge 0] \quad \forall k \\
& x_j \ge 0 && \forall j
\end{aligned}
$$

## ポイント

- **被約費用の双対公式**: 制約の双対変数 $\pi \ge 0$ を用いると、各変数の被約費用は $\bar{c}_j = c_j - \sum_k \pi_k A_{kj}$ で表されます。最適基底に入る変数（$x_j > 0$）では $\bar{c}_j = 0$ となり、非退化な最小化 LP で $x_j = 0$ に留まる非基底変数では $\bar{c}_j > 0$ となります。
- **感度分析と価格付けの意味**: $\bar{c}_j$ は「プロセス $j$ の単価がどれだけ下がれば最適解に参入できるか」の閾値であり、同時に $x_j$ を $0$ から 1 単位増やしたときの総コスト増加率でもあります。この評価は後半の章の**列生成法**で中心的な役割を果たします。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.minRequirements.map(
    (req, k) => expr`dot(${input.yields[k]}, ${quantities}) >= ${req}`
  )
);
m.objective(minimize(expr`dot(${input.costs}, ${quantities})`));
await m.solve();
const reducedCosts = quantities.map((v) => v.reducedCost!);
```

**PuLP (Python)**

```python
for k, req in enumerate(min_reqs):
    prob += pulp.lpDot(yields[k], quantities) >= req
prob += pulp.lpDot(costs, quantities)
prob.solve(pulp.HiGHS(msg=False))
reduced_costs = [0.0 if abs(v.dj) < 1e-9 else float(v.dj) for v in quantities]
```
