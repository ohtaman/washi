## 解题思路

将配送员 $i$ 是否负责区域 $j$ 定义为 **二维 0-1 变量矩阵** $x_{i,j} \in \{0, 1\}$，约束每一行有且仅有 1 个 1（和为 1：每位配送员负责 1 个区域）、每一列有且仅有 1 个 1（和为 1：每个区域由 1 人负责），并最小化总成本。

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

- **每行、每列有且仅有 1 个为 1 的约束**：令 0-1 变量之和等于 1 可以表达“恰好选 1 个”。只有行约束时多人可能挤在同一区域，只有列约束时一人可能兼顾多个区域；同时施加两者才能确定一对一的置换。（指派问题约束矩阵具有全幺模性，连续松弛的顶点本身就是 0-1 整数。）
- **从矩阵还原指派编号**：求解后在每行 `i` 中找出满足 `cell.value! === 1`（Python 中为 `round(pulp.value(x[i][j])) == 1`）的列下标 `j`。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

对二维 0-1 变量矩阵 `x` 分别施加行方向和列方向和为 1 的约束，求解后取出每行中取值为 1 的列下标。

**WaSHI (TypeScript)**

```ts
m.constraint(x.map((row) => expr`${sum(row)} == 1`));
m.constraint(x.map((_, j) => expr`${sum(x.map((row) => row[j]))} == 1`));

const assignment = x.map((row) =>
  row.findIndex((cell) => cell.value! === 1)
);
```

**PuLP (Python)**

```python
for i in range(n):
    prob += pulp.lpSum(x[i][j] for j in range(n)) == 1
for j in range(n):
    prob += pulp.lpSum(x[i][j] for i in range(n)) == 1

assignment = [
    next(j for j in range(n) if round(pulp.value(x[i][j])) == 1)
    for i in range(n)
]
```
