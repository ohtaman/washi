## 解题思路

建立 0-1 有向边变量 $x_{ij}$，限制每位客户入度与出度均为 $1$、配送中心出入车辆数相等且不超过 `maxVehicles`，再引入表示到达节点 $i$ 时累计载重的连续变量 $u_i \in [d_i, Q]$ 并施加 $u_i - u_j + Q x_{ij} \le Q - d_j$，从而同时刻画车载容量限制与子环消除。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n} \sum_{j \ne i} d_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{j \ne i} x_{ij} = 1, \quad \sum_{j \ne i} x_{ji} = 1 && \forall i \in \{1, \dots, n\} \\
& \sum_{j=1}^{n} x_{0j} = \sum_{i=1}^{n} x_{i0} \le K \\
& u_i - u_j + Q x_{ij} \le Q - \text{demands}[j] && \forall i \ne j \in \{1, \dots, n\} \\
& x_{ij} \in \{0, 1\}, \quad \text{demands}[i] \le u_i \le Q
\end{aligned}
$$

## 核心要点

- **载重累计约束一举两得**：将 TSP 中 MTZ 约束的步长 $+1$ 替换为客户需求 $d_j$，既把每条路径累计需求限制在 $[d_j, Q]$ 内，又自动杜绝脱离配送中心的子环（因为正需求沿环累加必矛盾）。
- **最紧致的有效 Big-M**：由于 $u_i \le Q$ 且 $u_j \ge d_j$，当 $x_{ij} = 0$ 时不等式自动满足（$u_i - u_j \le Q - d_j$），因此乘数 $Q$ 是无冗余的最紧界。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

对客户索引数组 `customers` 使用 `flatMap` 和 `filter` 枚举不同客户对，批量注册基于载重的 MTZ 约束，从而同时强制车载容量上限与子环消除。

**WaSHI (TypeScript)**

```ts
const customers = Array.from({ length: n - 1 }, (_, k) => k + 1);
m.constraint(
  customers.flatMap((i) =>
    customers
      .filter((j) => i !== j)
      .map((j) => expr`${u[i]!} - ${u[j]!} + ${Q} * ${x[i][j]!} <= ${Q - input.demands[j]}`)
  )
);
```

**PuLP (Python)**

```python
for i in range(1, n):
    for j in range(1, n):
        if i != j:
            prob += u[i] - u[j] + cap * x[i][j] <= cap - demands[j]
```
