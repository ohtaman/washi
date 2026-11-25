## 解题思路

引入虚拟起止节点 $n$，为 $0 \dots n$ 中所有有序对 $i \ne j$ 建立二进制转移变量 $x_{ij} \in \{0, 1\}$ 构成一条从 $n$ 出发并回到 $n$ 的哈密顿回路，同时用 Big-M 沿选中弧递推完工时间 $C_j$ 并最小化总延迟 $\sum_j T_j$。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} T_j \\
\text{s.t.} \quad & \sum_{j \ne i} x_{ij} = 1, \quad \sum_{j \ne i} x_{ji} = 1 && \forall i \in \{0, \dots, n\} \\
& C_j \ge C_i + s_{ij} + p_j - M(1 - x_{ij}) && \forall i \ne j \in \{0, \dots, n-1\} \\
& p_j \le C_j \le H, \quad T_j \ge C_j - d_j, \quad T_j \ge 0 && \forall j \in \{0, \dots, n-1\} \\
& x_{ij} \in \{0, 1\} && \forall i \ne j
\end{aligned}
$$

其中 $H = \sum_k p_k + (n - 1)\max_{a,b} s_{ab}$，$M = H + \max_{a,b} s_{ab}$。

## 核心要点

- **完工时间递推自动破除子环**：由于 $p_j > 0$ 且 $s_{ij} \ge 0$，仅在实作业 $\{0, \dots, n-1\}$ 内部成环会导致环上不等式相加出现正和大于零的矛盾，作用等同于 TSP 中的 MTZ 约束。
- **逆序作业对的安全 Big-M**：令 $H = \sum_k p_k + (n-1)\max_{a,b} s_{ab}$，由于末尾作业可达 $C_i = H$ 而首个作业为 $C_j = p_j$，满足 $C_i + s_{ij} + p_j - C_j \le H + s_{ij}$。因此取 $M = H + \max_{a,b} s_{ab}$ 可确保不会误删最优解。
- **为何交期优先会失效**：示例中，按最早交期（EDD）顺序（由 $d_2 = 5 < d_0 = 6 < d_1 = 8$ 得 $2 \to 0 \to 1$）会忽略换产时间，触发高额换产（$s_{20} = 3, s_{01} = 5$），导致总延迟升至 11 而非 4。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

添加各节点出度和入度均为 1 的度约束，以及沿选中弧传播完工时间的 Big-M 约束。在 WaSHI 中使用 `forEach` 和 `filter` 过滤掉自环变量后统一施加约束，在 PuLP 中则通过生成器表达式实现。

**WaSHI (TypeScript)**

```ts
x.forEach((row, i) => {
  const outVars = row.filter((v): v is NonNullable<typeof v> => v !== null);
  const inVars = x.map((r) => r[i]).filter((v): v is NonNullable<typeof v> => v !== null);
  m.constraint([expr`${sum(outVars)} == 1`, expr`${sum(inVars)} == 1`]);
});
input.setupMatrix.forEach((row, i) => {
  row.forEach((setup, j) => {
    if (i === j) return;
    const step = setup + input.processingTimes[j];
    m.constraint(
      expr`${completions[j]} >= ${completions[i]} + ${step} - ${M} * (1 - ${x[i][j]!})`
    );
  });
});
```

**PuLP (Python)**

```python
for i in range(n + 1):
    prob += pulp.lpSum(x[(i, j)] for j in range(n + 1) if j != i) == 1
    prob += pulp.lpSum(x[(j, i)] for j in range(n + 1) if j != i) == 1
for i in range(n):
    for j in range(n):
        if i != j:
            prob += completions[j] >= completions[i] + s[i][j] + p[j] - big_m * (1 - x[(i, j)])
```
