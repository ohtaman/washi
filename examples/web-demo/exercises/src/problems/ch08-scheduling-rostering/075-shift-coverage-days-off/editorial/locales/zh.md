## 解题思路

构造三维 0-1 变量 $x_{i,d,s} \in \{0, 1\}$ 表示员工 $i$ 在第 $d$ 天是否担任班次 $s$。约束每日每人至多一班（指定休假日强制为零）、各班次覆盖需求及个人工作量上下限，最小化总排班成本。

## 数学模型

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

## 核心要点

- **含休息选项的独热不等式（`<= 1`）**：使用 $\sum_s x_{i,d,s} \le 1$ 即可自然表示“任选一班或当日休息”，配合 `findIndex` 即可在休息时返回 `-1`、上班时返回班次编号 `0..S-1`。
- **提前封锁指定休假日**：对休息日施加和为零的等式约束，消除不可用班次选择。
- **工作量下限保障公平排班**：`minShifts[i]` 防止成本偏高的员工被长期闲置，在成本与均衡出勤之间取得平衡。
- 概念参考：[指南与术语表 — 基本建模要素](?view=guide&lang=zh#building-blocks) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

除了每位员工的指定休假日、每日至多一班以及工作班次上下限外，还需构建每日各班次的人力覆盖约束。在 WaSHI 中使用 `forEach` 和 `flatMap` 组装约束数组，在 PuLP 中则通过循环与 `pulp.lpSum` 实现。

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
m.constraint(
  input.demands.flatMap((dayDemands, d) =>
    dayDemands.map((req, s) => expr`${sum(x.map((staff) => staff[d][s]))} >= ${req}`)
  )
);
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
