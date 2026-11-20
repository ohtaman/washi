## アプローチ

スタッフ $i$ が日 $d$ にシフト $s$ を担当するかを 3 次元の 0-1 変数 $x_{i,d,s} \in \{0, 1\}$ で表し、1日最大1シフト（指定休日は0）、日別・シフト別必要人数、個人ごとの総勤務回数上下限を線形制約として課して総コストを最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{N-1} \sum_{d=0}^{D-1} \sum_{s=0}^{S-1} c_{i,s} x_{i,d,s} \\
\text{s.t.} \quad & \sum_{s=0}^{S-1} x_{i,d,s} = 0 && \forall i, \; d \in \text{Off}_i \\
& \sum_{s=0}^{S-1} x_{i,d,s} \le 1 && \forall i, \; d \notin \text{Off}_i \\
& \sum_{i=0}^{N-1} x_{i,d,s} \ge D_{d,s} && \forall d, s \\
& L_i \le \sum_{d=0}^{D-1} \sum_{s=0}^{S-1} x_{i,d,s} \le U_i && \forall i \\
& x_{i,d,s} \in \{0, 1\} && \forall i, d, s
\end{aligned}
$$

## ポイント

- **休みを含む排他割当（`<= 1`）**: 等式 `== 1` ではなく不等式 $\sum_s x_{i,d,s} \le 1$ にすることで「いずれか 1 シフトに入る、または休み」を簡潔に表現でき、`findIndex` で休みなら `-1`、勤務ならシフト番号 `0..S-1` に変換できます。
- **指定休日の固定**: 休日 `d` に対して `sum(dayVars) == 0` を置くことで、禁止日の割当を確実に排除できます。
- **最小勤務回数による稼働平準化**: `minShifts[i]` があることで、単価の高いスタッフが一切シフトに入らない偏りを防ぎつつ総コストを最適化します。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
x.forEach((staffDays, i) => {
  const offSet = new Set(input.daysOff[i]);
  staffDays.forEach((dayVars, d) => {
    m.constraint(offSet.has(d) ? expr`${sum(dayVars)} == 0` : expr`${sum(dayVars)} <= 1`);
  });
  const totalWorked = sum(staffDays.flat());
  m.constraint([
    expr`${totalWorked} >= ${input.minShifts[i]}`,
    expr`${totalWorked} <= ${input.maxShifts[i]}`,
  ]);
});
for (let d = 0; d < D; d++) {
  for (let s = 0; s < S; s++) {
    m.constraint(expr`${sum(x.map((staff) => staff[d][s]))} >= ${input.demands[d][s]}`);
  }
}
```

**PuLP (Python)**

```python
for i in range(num_staff):
    off_set = set(days_off[i])
    for d in range(num_days):
        day_sum = pulp.lpSum(x[i][d])
        prob += day_sum == 0 if d in off_set else day_sum <= 1
    total_i = pulp.lpSum(x[i][d][s] for d in range(num_days) for s in range(num_shifts))
    prob += total_i >= min_shifts[i]
    prob += total_i <= max_shifts[i]
```
