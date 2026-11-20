## 解题思路

建立表示有向弧是否选用的 0-1 变量 $x_{ij}$（$i \ne j$），限制每个城市的入度和出度均为 $1$，并对城市 $1 \dots n-1$ 引入连续位势变量 $u_i \in [1, n-1]$ 及 MTZ 约束 $u_i - u_j + n x_{ij} \le n - 1$ 以消除子环，最后最小化总路径费用。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \sum_{j \ne i} d_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{j \ne i} x_{ij} = 1, \quad \sum_{j \ne i} x_{ji} = 1 && \forall i \in \{0, \dots, n-1\} \\
& u_i - u_j + n x_{ij} \le n - 1 && \forall i \ne j \in \{1, \dots, n-1\} \\
& x_{ij} \in \{0, 1\}, \quad 1 \le u_i \le n - 1
\end{aligned}
$$

## 核心要点

- **仅靠度数约束为何不够**：入度与出度等于 1 只对应指派问题（允许多个互不相交的圈）。在示例输入中，`0 <-> 2`（费用 5）与 `1 <-> 3`（费用 5）组成的两个子环总费用仅 10，远低于单一哈密顿回路的 19。
- **MTZ 消除子环的原理**：只要在非起点城市间选择弧 $(i, j)$（$x_{ij} = 1$），约束就要求 $u_j \ge u_i + 1$，沿着路径位势严格递增；任何不包含城市 0 的子环累加一圈都会导出 $0 \ge |C| > 0$ 的矛盾，从而彻底杜绝子环。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

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
