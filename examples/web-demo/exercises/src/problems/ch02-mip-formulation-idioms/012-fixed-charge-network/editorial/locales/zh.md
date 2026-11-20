## 解题思路

建立 $S \times D$ 的 0-1 开关矩阵 `open` 与连续流量矩阵 `shipments`，在所有弧上添加 `shipments[i][j] <= capacities[i][j] * open[i][j]` 容量关联约束，配合仓库供应与门店需求约束最小化固定成本与运费之和。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{S-1} \sum_{j=0}^{D-1} \left( F_{i,j} y_{i,j} + c_{i,j} x_{i,j} \right) \\
\text{s.t.} \quad & 0 \le x_{i,j} \le C_{i,j} y_{i,j} && \forall i, j \\
& \sum_{j=0}^{D-1} x_{i,j} \le S_i && \forall i \\
& \sum_{i=0}^{S-1} x_{i,j} \ge D_j && \forall j \\
& y_{i,j} \in \{0, 1\} && \forall i, j
\end{aligned}
$$

## 核心要点

- **与纯线性运输模型（LP）的差异**：引入固定开启费用 $F_{i,j} y_{i,j}$ 后会产生流向合并效应，即使某条线路单位运费最低，若固定费用过高也可能被舍弃。
- **紧致弧上界关联**：使用线路真实容量 $C_{i,j}$ 而非随意巨大的常数乘以 $y_{i,j}$，既能得到紧致的 LP 松弛，又能自然封堵 `capacities[i][j] = 0` 的不可用线路。
- 概念参考：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(
  shipments.flatMap((row, i) =>
    row.map((flow, j) => expr`${flow} <= ${input.capacities[i][j]} * ${open[i][j]}`)
  )
);
m.objective(
  minimize(expr`dot(${input.fixedCosts}, ${open}) + dot(${input.unitCosts}, ${shipments})`)
);
```

**PuLP (Python)**

```python
for i in range(n_s):
    for j in range(n_d):
        prob += shipments[i][j] <= capacities[i][j] * open_vars[i][j]
prob += pulp.lpSum(
    fixed_costs[i][j] * open_vars[i][j] + unit_costs[i][j] * shipments[i][j]
    for i in range(n_s) for j in range(n_d)
)
```
