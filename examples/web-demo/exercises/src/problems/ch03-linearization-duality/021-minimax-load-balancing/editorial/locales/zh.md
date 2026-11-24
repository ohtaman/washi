## 解题思路

为每对任务和服务器建立连续分配比例 $x_{ij} \in [0, \text{compatible}_{ij}]$，并引入一个表示峰值负载上界的上境图辅助变量 $t$。对每台服务器施加总负载 $\sum_i w_i x_{ij} \le t$ 的约束并最小化 $t$，即可将极小化极大问题转化为标准线性规划。

## 数学模型

$$
\begin{aligned}
\min \quad & t \\
\text{s.t.} \quad & \sum_{j=0}^{m-1} x_{ij} = 1 && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} w_i x_{ij} \le t && \forall j \in \{0, \dots, m-1\} \\
& 0 \le x_{ij} \le \text{compatible}_{ij} && \forall i, j \\
& t \ge 0
\end{aligned}
$$

## 核心要点

- **上境图线性化技巧**：目标函数中的非线性 $\min \max_j L_j$ 等价于引入标量变量 $t$ 并对所有服务器加入 $L_j \le t$，再最小化 $t$。最小化压力会自动将 $t$ 压紧至 $\max_j L_j$。
- **利用变量上界屏蔽不兼容配对**：直接设置 `ub = compatible[i][j]`（`0` 或 `1`），即可在不增加额外线性约束行数的情况下强制不兼容服务器分得零负载。
- 概念参考：[指南与术语表 — 核心要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

通过 `m.constraint([...])` 批量注册 `assignments` 每行之和等于 1 的约束以及每台服务器总负载不超过上界变量 `peak` 的约束，然后最小化 `peak`。

**WaSHI (TypeScript)**

```ts
m.constraint(assignments.map((row) => expr`${sum(row)} == 1`));
m.constraint(
  Array.from({ length: nServers }, (_, j) => {
    const serverLoad = sum(
      input.weights.map((w, i) => expr`${w} * ${assignments[i][j]}`)
    );
    return expr`${serverLoad} <= ${peak}`;
  })
);
m.objective(minimize(peak));
```

**PuLP (Python)**

```python
for i in range(n_jobs):
    prob += pulp.lpSum(assignments[i]) == 1
for j in range(n_servers):
    prob += pulp.lpSum(weights[i] * assignments[i][j] for i in range(n_jobs)) <= peak
prob += peak
prob.solve(pulp.HiGHS(msg=False))
```
