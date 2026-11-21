## 解题思路

为每种物品声明带有上下界的整数变量（`0 <= x_i <= maxCounts[i]`），添加总重量上限约束 `dot(weights, counts) <= maxWeight`，并最大化总价值 `dot(values, counts)`。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} w_i x_i \le W_{\max} \\
& x_i \in \{0, 1, \dots, u_i\} && \forall i
\end{aligned}
$$

## 核心要点

- **连续松弛（LP）与整数规划（MIP）的区别**：若变量保持连续，求解器可能会算出例如 `1.75` 件物品这样不合实际的分数解；声明为整数变量后，求解器会严格在整数可行域内寻优。
- **结果取整归一化**：由于内部浮点容差，整数变量取值有时会表现为 `1.999999999` 或 `-0`，读取结果时建议使用 `Math.round(v.value!) || 0`（Python 中使用 `round(pulp.value(c))`）。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
const counts = input.maxCounts.map((cap, i) =>
  m.integer(`item_${i}`, { lb: 0, ub: cap })
);
m.constraint(
  expr`dot(${input.weights}, ${counts}) <= ${input.maxWeight}`,
  "weight_limit"
);
```

**PuLP (Python)**

```python
counts = [
    pulp.LpVariable(f"item_{i}", lowBound=0, upBound=cap, cat=pulp.LpInteger)
    for i, cap in enumerate(max_counts)
]
prob += pulp.lpDot(weights, counts) <= max_weight
```
