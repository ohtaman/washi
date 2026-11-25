## 解题思路

建立三维二进制决策变量 $x_{j,i,t} \in \{0, 1\}$ 表示是否将工序 $j$ 分派给员工 $i$ 在时间片 $t$ 执行，并引入非负连续加班变量 $o_i \ge 0$。将资质认证、员工单时段互斥、共享设备容量上限、工时上限与加班阈值统一建模并最小化总成本。

## 数学模型

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

## 核心要点

- **联合集成优化优于分步启发式**：先派工再排设备或时段容易造成设备冲突集中或触发高额加班；在统一的三维变量 $x_{j,i,t}$ 上协同优化可精确平衡人员资质、设备容量与时段偏好。
- **无需额外二进制变量的加班上境图**：当 $c^{\text{ot}}_i > 0$ 时，$o_i \ge \text{work}_i - R_i$ 与 $o_i \ge 0$ 在最小化目标下自动收敛到 $\max(0, \text{work}_i - R_i)$。
- **剔除无资质组合**：对 $\text{cert}_{i,j} = 0$ 的分派固定为零，大幅缩减分支搜索空间。
- 概念参考：[指南与术语表 — 基本建模要素](?view=guide&lang=zh#building-blocks) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

除了每位员工的单时段互斥、最大工作上限和加班上境图约束外，还需构建每个时间片的共享设备容量约束。在 WaSHI 中使用 `forEach` 和 `flatMap` 生成约束数组，在 PuLP 中则通过循环与 `pulp.lpSum` 实现。

**WaSHI (TypeScript)**

```ts
input.staffCosts.forEach((_, i) => {
  m.constraint(
    Array.from({ length: T }, (__, t) =>
      expr`${sum(x.map((jobStaff) => jobStaff[i][t]))} <= 1`
    )
  );
  const staffLoad = sum(x.flatMap((jobStaff) => jobStaff[i]));
  m.constraint([
    expr`${staffLoad} <= ${input.maxLimits[i]}`,
    expr`${overtime[i]} >= ${staffLoad} - ${input.regularLimits[i]}`,
  ]);
});
m.constraint(
  Array.from({ length: T }, (_, t) => {
    const eqUsed = sum(
      x.flatMap((jobStaff, j) =>
        jobStaff.map((staffSlots) => expr`${input.equipNeeds[j]} * ${staffSlots[t]}`)
      )
    );
    return expr`${eqUsed} <= ${input.equipCap}`;
  })
);
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
