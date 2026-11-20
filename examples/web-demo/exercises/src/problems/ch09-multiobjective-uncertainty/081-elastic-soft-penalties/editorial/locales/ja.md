## アプローチ

生産量 `quantities` ($q_j$) に加えて非負の不足変数 `shortfalls` ($s_j^-$) と超過変数 `excesses` ($s_j^+$) を導入し、各目標制約を等式 $q_j + s_j^- - s_j^+ = T_j$ で弾力化したうえで、ハードな設備上限と総量下限のもとで生産費＋ペナルティ和を最小化します。

## 数理モデル

$$
\begin{aligned}
\min_{q, s^-, s^+ \ge 0} \quad & \sum_{j=0}^{n-1} \left( c_j q_j + w_j^- s_j^- + w_j^+ s_j^+ \right) \\
\text{s.t.} \quad & q_j + s_j^- - s_j^+ = T_j && \forall j \in \{0, \dots, n-1\} \\
& \sum_{j=0}^{n-1} h_j q_j \le H_{\text{cap}} \\
& \sum_{j=0}^{n-1} q_j \ge Q_{\min}
\end{aligned}
$$

## ポイント

- **実行不能（INFEASIBLE）の回避と優先度トレードオフ**: `q_j == T_j` をハード制約にすると容量不足時に即座に実行不能になりますが、弾力制約にすることで必ず実行可能になり、階層的ペナルティ $w_j^-$ に応じて低優先度の品目から順番に不足を受け入れる挙動が線形計画だけで実現できます。
- **不足と超過が同時に正にならない性質**: $w_j^- + w_j^+ > 0$ のもとでは、$s_j^-$ と $s_j^+$ の両方から $\min(s_j^-, s_j^+)$ を引いても $q_j$ を変えずに目的値だけを下げられるため、最適解では自動的にどちらか一方のみが非ゼロになります。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [採点ステータス](?view=guide&lang=ja#verdicts)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.targets.map(
    (target, j) => expr`${quantities[j]} + ${shortfalls[j]} - ${excesses[j]} == ${target}`
  )
);
m.constraint(expr`dot(${input.hours}, ${quantities}) <= ${input.machineCap}`, "machine_cap");
m.constraint(expr`sum(${quantities}) >= ${input.minTotal}`, "min_total");
m.objective(
  minimize(
    expr`dot(${input.unitCosts}, ${quantities}) + dot(${input.shortfallPenalties}, ${shortfalls}) + dot(${input.excessPenalties}, ${excesses})`
  )
);
```

**PuLP (Python)**

```python
for j in range(n):
    prob += quantities[j] + shortfalls[j] - excesses[j] == targets[j]
prob += pulp.lpDot(hours, quantities) <= machine_cap
prob += pulp.lpSum(quantities) >= min_total
prob += (
    pulp.lpDot(unit_costs, quantities)
    + pulp.lpDot(shortfall_penalties, shortfalls)
    + pulp.lpDot(excess_penalties, excesses)
)
prob.solve(pulp.HiGHS(msg=False))
```
