## 解题思路

为每条候选路线设置 0-1 变量 `selected[j]`，将每项任务的覆盖约束从不等式（`>= 1`）收紧为精确等式（`== 1`），并最小化总运营成本。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{m-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j : i \in R_j} x_j = 1 && \forall i \in \{0, \dots, n-1\} \\
& x_j \in \{0, 1\} && \forall j \in \{0, \dots, m-1\}
\end{aligned}
$$

## 核心要点

- **等式（`== 1`）与覆盖不等式（`>= 1`）的成本分水岭**：在示例数据中，路线 0（成本 5）与路线 1（成本 5）合计只需 10 即可覆盖所有任务，但任务 `2` 会被重复覆盖两次；集合划分要求无重叠，因此必须采用成本 `11` 的无交叠组合。
- **机组排班与车辆路径规划的核心骨架**：将覆盖约束改为精确等式 `== 1` 后，该结构即为大规模列生成求解中主问题的标准模型。
- 概念参考：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

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
