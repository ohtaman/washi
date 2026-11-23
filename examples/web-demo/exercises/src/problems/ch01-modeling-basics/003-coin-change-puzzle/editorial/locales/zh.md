## 解题思路

声明带有各自上界（0 以上 `maxCounts[i]` 以下）的整数决策变量，添加精确目标金额等式约束 `dot(denominations, counts) == targetAmount`，并最小化 `sum(counts)`。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} d_i x_i = T \\
& x_i \in \{0, 1, \dots, u_i\} && \forall i
\end{aligned}
$$

## 要点总结

- **整数变量与连续变量**：若保留为连续变量（LP 松弛），求解器可能会取 1.5 枚这样的分数硬币。改用 `m.integer`（`pulp.LpInteger`）即可变为混合整数规划（**MIP**），从而只允许整数枚数。
- **为什么贪心法无法得到最优解**：对于面额 `[1, 3, 4]` 和目标金额 6，优先选最大面额会得到 $4 + 1 + 1$（3 枚），而最优整数解 $3 + 3$ 仅需 2 枚。
- **安全的整数提取**：求解器浮点容差可能返回 `1.999999999` 或 `-0`，因此请使用 `Math.round(v.value!) || 0`（Python 中为 `round(pulp.value(c))`）进行规范化。
- 术语参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [问题分类](?view=guide&lang=zh#paradigms)。

## 核心代码片段

将每种硬币的使用枚数声明为 0 以上、不超过上限枚数的整数变量，并设置总金额等式约束和最小化总枚数目标。

**WaSHI (TypeScript)**

```ts
const counts = input.maxCounts.map((cap, i) =>
  m.integer(`coin_${i}`, { lb: 0, ub: cap })
);
m.constraint(
  expr`dot(${input.denominations}, ${counts}) == ${input.targetAmount}`,
  "exact_target"
);
m.objective(minimize(expr`sum(${counts})`));
```

**PuLP (Python)**

```python
counts = [
    pulp.LpVariable(f"coin_{i}", lowBound=0, upBound=cap, cat=pulp.LpInteger)
    for i, cap in enumerate(max_counts)
]
prob += pulp.lpDot(denominations, counts) == target_amount
prob += pulp.lpSum(counts)
```
