## 解题思路

建立二进制排班变量 $x_{i,d,s} \in \{0, 1\}$（$s \in \{0, 1, 2\}$）与日出勤指示量 $w_{i,d} = \sum_s x_{i,d,s} \le 1$。在所有长度为 $K+1$ 的连续滑动窗口中限制工作天数之和不超过 $K$，同时以 $x_{i,d,2} + x_{i,d+1,0} \le 1$ 禁止夜班后次日紧接日班，满足各班次人力需求并最小化总成本。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{N-1} \sum_{d=0}^{D-1} \sum_{s=0}^{2} c_{i,s} x_{i,d,s} \\
\text{s.t.} \quad & w_{i,d} = \sum_{s=0}^{2} x_{i,d,s} \le 1 && \forall i, d \\
& \sum_{i=0}^{N-1} x_{i,d,s} \ge D_{d,s} && \forall d, s \\
& \sum_{\tau=t}^{t+K} w_{i,\tau} \le K && \forall i, \; t \in \{0, \dots, D - K - 1\} \\
& x_{i,d,2} + x_{i,d+1,0} \le 1 && \forall i, \; d \in \{0, \dots, D - 2\} \\
& x_{i,d,s} \in \{0, 1\} && \forall i, d, s
\end{aligned}
$$

## 核心要点

- **滑动窗口求和简洁限制连班**：要求任意 $K+1$ 个连续日子里的工作天数之和 $\le K$，即可在不增加连班计数状态变量的情况下彻底杜绝超过 $K$ 天的连续工作。
- **两项和 $\le 1$ 线性刻画禁忌衔接**：不等式 $x_{i,d,2} + x_{i,d+1,0} \le 1$ 精确排除了夜班（`2`）次日接日班（`0`），同时允许连续夜班或夜班后安排休息。
- **周期排班余量约束**：滑动窗口不仅限制总天数，还会约束休息日的分布位置，防止低成本员工长期满负荷排班。
- 概念参考：[指南与术语表 — 基本建模要素](?view=guide&lang=zh#building-blocks) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

**WaSHI (TypeScript)**

```ts
x.forEach((staffDays) => {
  const work = staffDays.map((dayVars) => sum(dayVars));
  m.constraint(work.map((w) => expr`${w} <= 1`));
  for (let t = 0; t <= D - K - 1; t++) {
    m.constraint(expr`${sum(work.slice(t, t + K + 1))} <= ${K}`);
  }
  for (let d = 0; d < D - 1; d++) {
    m.constraint(expr`${staffDays[d][2]} + ${staffDays[d + 1][0]} <= 1`);
  }
});
```

**PuLP (Python)**

```python
for i in range(num_staff):
    for d in range(num_days):
        prob += pulp.lpSum(x[i][d]) <= 1
    for t in range(num_days - max_consec):
        prob += pulp.lpSum(x[i][tau][s] for tau in range(t, t + max_consec + 1) for s in range(3)) <= max_consec
    for d in range(num_days - 1):
        prob += x[i][d][2] + x[i][d + 1][0] <= 1
```
