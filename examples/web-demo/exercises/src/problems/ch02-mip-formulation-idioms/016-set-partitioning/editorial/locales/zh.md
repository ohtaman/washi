## 解题思路

对于 $n$ 项任务（`numTasks`）和 $m$ 条运营成本为 $c_j$（`costs[j]`）、包含任务集合 $R_j$（`routes[j]`）的候选路线，为每条路线设置 0-1 变量 $x_j$（`selected[j]`）。将每项任务的覆盖约束从不等式（`>= 1`）收紧为精确等式（`== 1`），并最小化总运营成本。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{m-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j : i \in R_j} x_j = 1 && \forall i \in \{0, \dots, n-1\} \\
& x_j \in \{0, 1\} && \forall j \in \{0, \dots, m-1\}
\end{aligned}
$$

## 核心要点

- **等式（`== 1`）与覆盖不等式（`>= 1`）的成本分水岭**：在示例中，选择路线 0（`[0, 1, 2]`，成本 5）与路线 1（`[2, 3, 4]`，成本 5）合计只需 10 即可覆盖所有任务，但两条路线在任务 2 上发生重叠；集合划分（`== 1`）拒绝重叠，因此必须选择路线 1 与路线 2，以成本 11 达成精确划分。
- **机组排班与车辆路径规划的核心骨架**：将覆盖约束改为精确等式 `== 1` 后，该结构即为大规模列生成求解中主问题的标准模型。
- 概念参考：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

对每个任务 `i`，筛选出 `input.routes[j]` 中包含 `i` 的路线选择变量 `selected[j]`，并生成其和恰好等于 1 的等式约束。

**WaSHI (TypeScript)**

```ts
m.constraint(
  Array.from({ length: input.numTasks }, (_, i) =>
    expr`${sum(selected.filter((_, j) => input.routes[j].includes(i)))} == 1`
  )
);
m.objective(minimize(expr`dot(${input.costs}, ${selected})`));
```

**PuLP (Python)**

```python
for i in range(num_tasks):
    prob += pulp.lpSum(selected[j] for j in range(m_count) if i in routes[j]) == 1
prob += pulp.lpDot(costs, selected)
```
