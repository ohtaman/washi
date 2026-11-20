## 解题思路

为每个候选子集建立 0-1 选择变量 `selected[j]`，对每个要素 `i` 约束包含它的子集选中之和至少为 `1`，并最小化总成本。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{m-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j : i \in S_j} x_j \ge 1 && \forall i \in \{0, \dots, n-1\} \\
& x_j \in \{0, 1\} && \forall j \in \{0, \dots, m-1\}
\end{aligned}
$$

## 核心要点

- **为何贪心法容易失灵**：按“单位新增覆盖成本最低”贪心先选大集合（如成本 8 覆盖 4 项），往往会在后期为补齐漏掉的单项额外付出代价，不如全局组合两个小集合划算。
- **覆盖（`>= 1`）与划分（`== 1`）的区别**：集合覆盖允许要素被重复覆盖，从而利用更便宜的重叠子集降低总支出。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [模型基本要素](?view=guide&lang=zh#building-blocks)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(
  Array.from({ length: input.numElements }, (_, i) =>
    expr`${sum(selected.filter((_, j) => input.sets[j].includes(i)))} >= 1`
  )
);
m.objective(minimize(expr`dot(${input.costs}, ${selected})`));
```

**PuLP (Python)**

```python
for i in range(num_elements):
    prob += pulp.lpSum(selected[j] for j in range(m_count) if i in sets[j]) >= 1
prob += pulp.lpDot(costs, selected)
```
