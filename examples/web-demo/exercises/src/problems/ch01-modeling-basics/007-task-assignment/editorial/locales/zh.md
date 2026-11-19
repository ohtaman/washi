## 解题思路

建立表示员工 $i$ 与任务 $j$ 配对关系的二维 0-1 矩阵 `x[i][j]`，约束每行和等于 `1`（每人 1 项任务）、每列和等于 `1`（每项任务 1 人），并最小化总指派成本。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \sum_{j=0}^{n-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} x_{i,j} = 1 && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} x_{i,j} = 1 && \forall j \in \{0, \dots, n-1\} \\
& x_{i,j} \in \{0, 1\} && \forall i, j
\end{aligned}
$$

## 核心要点

- **双随机约束刻画一一匹配**：行和 `== 1` 保证每个人不闲置也不兼任，列和 `== 1` 保证每项任务都有且仅有一人负责。（指派问题约束矩阵具有全幺模性，连续松弛的顶点本身就是 0-1 整数。）
- **还原分配数组**：求解后使用 `row.findIndex((cell) => Math.round(cell.value!) === 1)`（Python 中用 `round(h.val(x[i][j])) == 1`）提取每行唯一被选中的列下标。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(x.map((row) => expr`${sum(row)} == 1`));
m.constraint(x.map((_, j) => expr`${sum(x.map((row) => row[j]))} == 1`));

const assignment = x.map((row) =>
  row.findIndex((cell) => Math.round(cell.value!) === 1)
);
```

**Python (highspy)**

```python
for i in range(n):
    h.addConstr(h.qsum(x[i][j] for j in range(n)) == 1)
for j in range(n):
    h.addConstr(h.qsum(x[i][j] for i in range(n)) == 1)

assignment = [
    next(j for j in range(n) if round(h.val(x[i][j])) == 1)
    for i in range(n)
]
```
