## 解题思路

建立表示站点开设的 0-1 变量 `open[j]` 和区域覆盖的 0-1 变量 `covered[i]`，限制总站点数不超过 `maxFacilities`，对每个区域约束 `covered[i]` 不超过服务半径内已开站点数之和，并最大化总覆盖需求。

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

- **为何单边不等式 `z_i <= sum(...)` 足以表达“至少一处开启”**：由于 $z_i \in \{0, 1\}$ 且目标权重 $d_i \ge 0$，只要半径内有站点开启，最大化目标就会自动把 $z_i$ 推向 $1$；而当半径内无站点（包括孤立不可达区）时，$z_i \le 0$ 强制其为 $0$。
- **MCLP 与集合覆盖的差异**：集合覆盖要求覆盖全部对象并最小化成本，而 MCLP 在有限设施预算 $p$ 下尽可能覆盖最多的加权需求。
- 概念参考：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

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
