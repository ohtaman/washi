## 解题思路

为每项作业引入连续开工时间变量 $S_j \ge r_j$ 与非负延迟变量 $T_j \ge 0$，利用 $T_j \ge S_j + p_j - d_j$ 线性化延迟惩罚，再对每对作业 $(i, j)$ 引入二进制先后变量 $y_{ij} \in \{0, 1\}$ 与 Big-M 析取约束防止时间重叠。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} w_j T_j \\
\text{s.t.} \quad & r_j \le S_j \le H - p_j, \quad T_j \ge S_j + p_j - d_j, \quad T_j \ge 0 && \forall j \\
& S_i + p_i \le S_j + M(1 - y_{ij}) && \forall i < j \\
& S_j + p_j \le S_i + M y_{ij} && \forall i < j \\
& y_{ij} \in \{0, 1\} && \forall i < j
\end{aligned}
$$

其中 $H = \max_k r_k + \sum_k p_k$，$M = H$。

## 核心要点

- **无需离散化的析取模型**：$y_{ij}=1$ 强制作业 $i$ 先于 $j$，反之强制 $j$ 先于 $i$；相比时间索引 0-1 变量，析取模型可直接处理带小数的释放时间与工期。
- **紧凑的合法 Big-M**：压缩无效空闲后的最优调度必在 $H = \max_k r_k + \sum_k p_k$ 内完工。在 $r_j \ge 0$ 且 $S_j \le H - p_j$ 的条件下，取 $M = H$ 即可得到合法的统一上界，使线性松弛远比随意取极大常数时更紧凑。
- **主动等待（Inserted Idle Time）**：带释放时间时，在设备空闲时刻刻意等待即将到达的高权重作业，往往优于立即开工的非延迟贪心策略。例如在示例中，从 $t = 0$ 空闲等待至 $t = 2$ 优先加工权重 $w_1 = 5$ 的作业 1，可显著降低加权总延迟。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

构建各作业的交期延迟下界约束以及全部作业对的互不重叠 Big-M 析取约束。在 WaSHI 中使用 `slice` 和 `forEach` 将每对作业的两条约束以数组形式注册，在 PuLP 中则通过双重循环与 `pulp.lpDot` 实现。

**WaSHI (TypeScript)**

```ts
m.constraint(
  tardiness.map(
    (T, j) => expr`${T} >= ${starts[j]} + ${input.processingTimes[j]} - ${input.dueDates[j]}`
  )
);
starts.forEach((sI, i) => {
  starts.slice(i + 1).forEach((sJ, offset) => {
    const j = i + 1 + offset;
    const y = m.binary(`y_${i}_${j}`);
    m.constraint([
      expr`${sI} + ${input.processingTimes[i]} <= ${sJ} + ${M} * (1 - ${y})`,
      expr`${sJ} + ${input.processingTimes[j]} <= ${sI} + ${M} * ${y}`,
    ]);
  });
});
m.objective(minimize(expr`dot(${input.weights}, ${tardiness})`));
```

**PuLP (Python)**

```python
for j in range(n):
    prob += tardiness[j] >= starts[j] + p[j] - d[j]
for i in range(n):
    for j in range(i + 1, n):
        y = pulp.LpVariable(f"y_{i}_{j}", cat=pulp.LpBinary)
        prob += starts[i] + p[i] <= starts[j] + big_m * (1 - y)
        prob += starts[j] + p[j] <= starts[i] + big_m * y
prob += pulp.lpDot(w, tardiness)
prob.solve(pulp.HiGHS(msg=False))
```
