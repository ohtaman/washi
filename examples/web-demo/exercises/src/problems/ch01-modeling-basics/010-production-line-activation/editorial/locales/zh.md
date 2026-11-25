## 解题思路

为每条产线配对表示开启状态的 **0-1 变量** $y_i \in \{0, 1\}$ 与表示产量的非负连续变量 $q_i \ge 0$，通过**产能关联约束** $q_i \le C_i y_i$ 联动开关与产能上限，在树脂颗粒库存上限约束下最大化净利润（总毛利减去总固定成本）。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} m_i q_i - \sum_{i=0}^{n-1} F_i y_i \\
\text{s.t.} \quad & 0 \le q_i \le C_i y_i && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} a_i q_i \le M_{\text{cap}} \\
& y_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## 核心要点

- **0-1 开关控制连续容量（Big-M 基础）**：用产能上限 $C_i$ 乘以二进制开关 $y_i$ 写成 $q_i \le C_i y_i$，即可同时刻画“停机强制零产出（$y_i=0 \implies q_i=0$）”和“开机产能封顶（$y_i=1 \implies q_i \le C_i$）”，也是第 2 章 Big-M 与固定费用网络的基础构件。
- **分离固定开机成本与边际利润**：目标函数写成 `dot(margins, quantities) - dot(fixedCosts, open)`，使每条已开机产线（$y_i = 1$）无论实际生产多少，都恰好只扣除一次固定成本。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

用 `quantities[i] <= capacities[i] * open[i]` 将 0-1 变量 `open[i]` 与连续变量 `quantities[i]` 关联起来，并将毛利与固定成本之差写入同一个目标函数中。

**WaSHI (TypeScript)**

```ts
m.constraint(
  quantities.map((qty, i) => expr`${qty} <= ${input.capacities[i]} * ${open[i]}`)
);
m.constraint(
  expr`dot(${input.materialUsages}, ${quantities}) <= ${input.materialCap}`,
  "material"
);
m.objective(
  maximize(
    expr`dot(${input.margins}, ${quantities}) - dot(${input.fixedCosts}, ${open})`
  )
);
```

**PuLP (Python)**

```python
for i in range(n):
    prob += quantities[i] <= capacities[i] * open_vars[i]
prob += pulp.lpDot(material_usages, quantities) <= material_cap
prob += pulp.lpDot(margins, quantities) - pulp.lpDot(fixed_costs, open_vars)
prob.solve(pulp.HiGHS(msg=False))
```
