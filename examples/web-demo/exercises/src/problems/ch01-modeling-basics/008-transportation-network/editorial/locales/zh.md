## 解题思路

将烘焙工厂 $i$ 运往咖啡门店 $j$ 的配送量（kg）定义为非负连续变量 $x_{i,j} \ge 0$，施加各工厂的**发货上限（行和 $\le S_i$）**和各门店的**需求下限（列和 $\ge D_j$）**，并最小化总运输成本。

## 数学模型

$$
\begin{aligned}
\min_{x \ge 0} \quad & \sum_{i=0}^{S-1} \sum_{j=0}^{D-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{D-1} x_{i,j} \le S_i && \forall i \in \{0, \dots, S-1\} \\
& \sum_{i=0}^{S-1} x_{i,j} \ge D_j && \forall j \in \{0, \dots, D-1\}
\end{aligned}
$$

## 核心要点

- **全幺模性带来的天然整数解**：运输问题对应二分图网络流，只要 `supplies` 与 `demands` 都是整数，即使所有变量均设为连续 LP 变量，求得的最优顶点也天然都是整数。
- **使用 `.map()` 与 `.flatMap()` 表达二维求和**：用 `map` 分别组装供应行约束与需求列约束，并用 `flatMap` 把二维费用矩阵展开为线性目标。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

针对二维变量数组 `shipments`，分别使用 `.map()` 构建行方向之和（工厂发货上限）与列方向之和（门店需求下限）的约束。

**WaSHI (TypeScript)**

```ts
m.constraint(
  shipments.map((row, i) => expr`${sum(row)} <= ${input.supplies[i]}`)
);
m.constraint(
  input.demands.map(
    (demand, j) => expr`${sum(shipments.map((row) => row[j]))} >= ${demand}`
  )
);
```

**PuLP (Python)**

```python
for i in range(n_s):
    prob += pulp.lpSum(shipments[i][j] for j in range(n_d)) <= supplies[i]
for j in range(n_d):
    prob += pulp.lpSum(shipments[i][j] for i in range(n_s)) >= demands[j]
```
