## アプローチ

手順 $j$ を時間枠 $t$ の認定スタッフ $i$ に割り当てる 3 次元の 0-1 変数 $x_{j,i,t} \in \{0, 1\}$ と、各スタッフの残業量を表す非負変数 $o_i \ge 0$ を導入します。資格適合性・スタッフの枠別排他・共有設備台数上限・最大稼働上限・残業しきい値を 1 つのモデルに統合し、総コストを最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{J-1} \sum_{i=0}^{N-1} \sum_{t=0}^{T-1} (c_i + p_{j,t}) x_{j,i,t} + \sum_{i=0}^{N-1} c^{\text{ot}}_i o_i \\
\text{s.t.} \quad & \sum_{i=0}^{N-1} \sum_{t=0}^{T-1} x_{j,i,t} = 1 && \forall j \\
& \sum_{t=0}^{T-1} x_{j,i,t} = 0 && \forall i, j : \text{cert}_{i,j} = 0 \\
& \sum_{j=0}^{J-1} x_{j,i,t} \le 1 && \forall i, t \\
& \sum_{j=0}^{J-1} \sum_{i=0}^{N-1} e_j x_{j,i,t} \le E_{\text{cap}} && \forall t \\
& \sum_{j=0}^{J-1} \sum_{t=0}^{T-1} x_{j,i,t} \le M_i, \quad o_i \ge \sum_{j=0}^{J-1} \sum_{t=0}^{T-1} x_{j,i,t} - R_i, \quad o_i \ge 0 && \forall i \\
& x_{j,i,t} \in \{0, 1\} && \forall j, i, t
\end{aligned}
$$

## ポイント

- **段階分割より統合最適化が優れる理由**: 人員割当だけ先に決めてから設備容量や枠ペナルティを合わせようとすると、特定スロットへの設備集中や不要な残業を招きます。3 次元テンソル $x_{j,i,t}$ で同時最適化することで、設備・枠・残業のトレードオフを厳密に扱えます。
- **補助 0-1 変数なしの残業エピグラフ**: $c^{\text{ot}}_i > 0$ かつ $o_i \ge 0$、$o_i \ge \text{work}_i - R_i$ により、最小化すれば自動的に $o_i = \max(0, \text{work}_i - R_i)$ が達成されます。
- **無資格ペアの事前固定**: $\text{cert}_{i,j} = 0$ の変数を 0 に固定して探索空間を小さく保ちます。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
for (let i = 0; i < N; i++) {
  for (let t = 0; t < T; t++) {
    m.constraint(expr`${sum(x.map((jobStaff) => jobStaff[i][t]))} <= 1`);
  }
  const staffLoad = sum(x.flatMap((jobStaff) => jobStaff[i]));
  m.constraint([
    expr`${staffLoad} <= ${input.maxLimits[i]}`,
    expr`${overtime[i]} >= ${staffLoad} - ${input.regularLimits[i]}`,
  ]);
}
for (let t = 0; t < T; t++) {
  const eqUsed = sum(
    x.flatMap((jobStaff, j) =>
      jobStaff.map((staffSlots) => expr`${input.equipNeeds[j]} * ${staffSlots[t]}`)
    )
  );
  m.constraint(expr`${eqUsed} <= ${input.equipCap}`);
}
```

**PuLP (Python)**

```python
for i in range(num_staff):
    for t in range(num_slots):
        prob += pulp.lpSum(x[j][i][t] for j in range(num_jobs)) <= 1
    staff_load = pulp.lpSum(x[j][i][t] for j in range(num_jobs) for t in range(num_slots))
    prob += staff_load <= max_limits[i]
    prob += overtime[i] >= staff_load - reg_limits[i]
for t in range(num_slots):
    prob += pulp.lpSum(equip_needs[j] * x[j][i][t] for j in range(num_jobs) for i in range(num_staff)) <= equip_cap
```
