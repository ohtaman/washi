## 思路

引入二元衔接变量 $x_{ij} \in \{0, 1\}$（$i \ne j$）以约束每首曲目的入度与出度均为 $1$，再为 $i \ge 1$ 引入连续的 MTZ 播放顺位势能 $u_i \in [1, n-1]$ 及约束 $u_i - u_j + n x_{ij} \le n - 1$，从而最小化总循环衔接代价。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \sum_{j \ne i} c_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{j \ne i} x_{ij} = 1, \quad \sum_{j \ne i} x_{ji} = 1 && \forall i \in \{0, \dots, n-1\} \\
& u_i - u_j + n x_{ij} \le n - 1 && \forall i \ne j \in \{1, \dots, n-1\} \\
& x_{ij} \in \{0, 1\}, \quad 1 \le u_i \le n - 1
\end{aligned}
$$

## 关键要点

- **仅靠度数约束为何失效**：入度 = 出度 = 1 只能保证顶点不交的圈覆盖——在示例数据中，`0 <-> 2`（代价 5）与 `1 <-> 3`（代价 6）会以总代价 11 绕过单环要求，而真实最优代价为 18。
- **MTZ 如何消除子环**：当非开场曲目间的衔接 $(i, j)$ 被选中（$x_{ij} = 1$）时，$u_j \ge u_i + 1$ 强制势能沿序列严格递增；对任意不含曲目 0 的环 $C$ 求和会得到 $0 \ge |C| > 0$ 的矛盾，因此不可能形成子环。当 $x_{ij} = 0$ 时，因 $u_i \le n - 1$ 且 $u_j \ge 1$，$u_i - u_j \le n - 1$ 恒成立。
- 相关概念：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) 与 [问题族](?view=guide&lang=zh#paradigms)。

## 核心实现

**WaSHI (TypeScript)**

```ts
for (let i = 1; i < n; i++) {
  for (let j = 1; j < n; j++) {
    if (i !== j) {
      m.constraint(expr`${u[i]!} - ${u[j]!} + ${n} * ${x[i][j]!} <= ${n - 1}`);
    }
  }
}
```

**PuLP (Python)**

```python
for i in range(1, n):
    for j in range(1, n):
        if i != j:
            prob += u[i] - u[j] + n * x[i][j] <= n - 1
```
