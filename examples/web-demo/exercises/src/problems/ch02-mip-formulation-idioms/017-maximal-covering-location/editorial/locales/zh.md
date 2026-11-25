## 解题思路

为候选站点引入 0-1 开设变量 $y_j$（`open[j]`），为各需求区引入 0-1 覆盖变量 $z_i$（`covered[i]`），限制总开设站点数不超过 $p$（`maxFacilities`），对每个区域约束 $z_i$ 不超过服务半径 $R$（`coverageRadius`）内已开站点数之和，并最大化按需求 $d_i$（`demands[i]`）加权的总覆盖需求。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} d_i z_i \\
\text{s.t.} \quad & \sum_{j=0}^{m-1} y_j \le p \\
& z_i \le \sum_{j : \text{dist}_{i,j} \le R} y_j && \forall i \in \{0, \dots, n-1\} \\
& y_j, z_i \in \{0, 1\} && \forall j, i
\end{aligned}
$$

## 核心要点

- **为何单边不等式 $z_i \le \sum y_j$ 足以表达“至少一处开启”**：由于 $z_i \in \{0, 1\}$ 且需求权重非负（$d_i \ge 0$），只要服务半径内有站点开启，最大化目标就会自然使 $d_i > 0$ 的区域取 $z_i = 1$（而 $d_i = 0$ 的区域不影响目标值）；当半径内无站点开启（包括孤立不可达区）时，$z_i \le 0$ 会强制 $z_i = 0$。
- **MCLP 与集合覆盖的差异**：集合覆盖要求覆盖全部对象并最小化成本，而 MCLP 在有限设施预算 $p$ 下尽可能覆盖最多的加权需求。
- 概念参考：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

在开设站点数上限约束之外，为每个需求区 `i` 添加覆盖变量 `covered[i]` 不超过可达候选站点的 `open[j]` 之和的耦合约束，并最大化总覆盖需求。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${sum(open)} <= ${input.maxFacilities}`, "max_facilities");
m.constraint(
  covered.map((cov, i) =>
    expr`${cov} <= ${sum(open.filter((_, j) => input.distances[i][j] <= input.coverageRadius))}`
  )
);
m.objective(maximize(expr`dot(${input.demands}, ${covered})`));
```

**PuLP (Python)**

```python
prob += pulp.lpSum(open_vars) <= max_facilities
for i in range(n):
    prob += covered[i] <= pulp.lpSum(
        open_vars[j] for j in range(m_sites) if distances[i][j] <= radius
    )
prob += pulp.lpDot(demands, covered)
```
