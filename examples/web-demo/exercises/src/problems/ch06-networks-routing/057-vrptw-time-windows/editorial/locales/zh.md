## 解题思路

建立 0-1 有向边变量 $x_{ij}$（$i \ne j$）与表示节点服务开始时间的连续变量 $t_i \in [a_i, b_i]$，通过紧致 Big-M 不等式 $t_i + s_i + d_{ij} - t_j \le M_{ij}(1 - x_{ij})$ 沿启用弧递推时间，并约束返回配送中心的时刻不超过 $b_0$。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n} \sum_{j \ne i} d_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{j \ne i} x_{ij} = \sum_{j \ne i} x_{ji} = 1 && \forall i \in \{1, \dots, n\}, \qquad \sum_{j=1}^n x_{0j} = \sum_{i=1}^n x_{i0} \le K \\
& t_0 = a_0, \quad a_i \le t_i \le b_i, \quad 1 \le u_i \le n && \forall i \in \{1, \dots, n\} \\
& t_i + s_i + d_{ij} - t_j \le M_{ij}(1 - x_{ij}) && \forall i \in \{0, \dots, n\}, j \in \{1, \dots, n\}, i \ne j \\
& u_i + 1 - u_j \le n(1 - x_{ij}) && \forall i, j \in \{1, \dots, n\}, i \ne j \\
& t_i + s_i + d_{i0} \le b_0 + M_{i0}(1 - x_{i0}) && \forall i \in \{1, \dots, n\} \\
& x_{ij} \in \{0, 1\} && \forall i \ne j
\end{aligned}
$$

其中 $M_{ij} = \max(0, b_i + s_i + d_{ij} - a_j)$，$M_{i0} = \max(0, b_i + s_i + d_{i0} - b_0)$。

## 核心要点

- **用不等式而非等式刻画提前到达等待**：写为 $t_j \ge t_i + s_i + d_{ij}$ 并配合变量下界 $t_j \ge a_j$，即可允许早到的车辆原地等待至时间窗开启。
- **MTZ 访问序势能消除零时间子环**：当同址客户出现 $s_i + d_{ij} = 0$ 时，仅靠时间单调性无法阻止零成本的客户子环（如 `1 -> 2 -> 1`）。引入访问序变量 $u_i \in [1, n]$ 与 $u_i + 1 - u_j \le n(1 - x_{ij})$，可确保在任何零耗时情形下仍严格消除子环。
- **紧致 Big-M 取值**：利用 $t_i \le b_i$ 与 $t_j \ge a_j$ 精确取 $M_{ij} = \max(0, b_i + s_i + d_{ij} - a_j)$，能显著收紧 LP 松弛。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
for (let i = 1; i < n; i++) {
  const bigMi0 = Math.max(0, latest[i] + service[i] + dist[i][0] - latest[0]);
  m.constraint(
    expr`${t[i]} + ${service[i] + dist[i][0]} <= ${latest[0]} + ${bigMi0} * (1 - ${x[i][0]!})`
  );
  for (let j = 1; j < n; j++) {
    if (i !== j) {
      const bigMij = Math.max(0, latest[i] + service[i] + dist[i][j] - earliest[j]);
      m.constraint(
        expr`${t[i]} + ${service[i] + dist[i][j]} - ${t[j]} <= ${bigMij} * (1 - ${x[i][j]!})`
      );
      m.constraint(expr`${u[i]!} + 1 - ${u[j]!} <= ${n - 1} * (1 - ${x[i][j]!})`);
    }
  }
}
```

**PuLP (Python)**

```python
for i in range(1, n):
    mi0 = max(0, latest[i] + service[i] + dist[i][0] - latest[0])
    prob += t[i] + service[i] + dist[i][0] <= latest[0] + mi0 * (1 - x[i][0])
    for j in range(1, n):
        if i != j:
            mij = max(0, latest[i] + service[i] + dist[i][j] - earliest[j])
            prob += t[i] + service[i] + dist[i][j] - t[j] <= mij * (1 - x[i][j])
            prob += u[i] + 1 - u[j] <= (n - 1) * (1 - x[i][j])
```
