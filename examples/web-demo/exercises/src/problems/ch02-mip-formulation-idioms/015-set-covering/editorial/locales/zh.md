## 解题思路

将 $n$ 个组件（`numElements`）视作元素 $i$，将 $m$ 个监控服务包视作采购成本为 $c_j$（`costs[j]`）的候选集合 $S_j$（`sets[j]`）。为每个服务包建立 0-1 选择变量 $x_j$（`selected[j]`），对每个组件 $i$ 约束包含它的服务包选中之和至少为 1，并最小化总采购成本。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{m-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j : i \in S_j} x_j \ge 1 && \forall i \in \{0, \dots, n-1\} \\
& x_j \in \{0, 1\} && \forall j \in \{0, \dots, m-1\}
\end{aligned}
$$

## 核心要点

- **为何贪心启发式会失灵**：在示例中，如果先选覆盖面最大的服务包 4（覆盖 `[0, 1, 3, 4]`，成本 8），会遗留组件 2，迫使再额外购买至少成本 5 的服务包，总成本至少为 13（而选择服务包 1 和 2 只需 9）。一般而言，即便按“单位新增覆盖组件成本最低”贪心选取，前期看似划算的服务包也可能留下位置尴尬的未覆盖组件，从而错失全局最优组合。
- **覆盖（`>= 1`）与划分（`== 1`）的区别**：集合覆盖允许组件被多个服务包重复覆盖，从而利用更便宜的重叠服务包降低总采购成本。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [模型基本要素](?view=guide&lang=zh#building-blocks)

## 实现要点

对每个组件 `i`，筛选出 `input.sets[j]` 中包含 `i` 的监控服务包选择变量 `selected[j]`，并生成其和不少于 1 的约束。

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
