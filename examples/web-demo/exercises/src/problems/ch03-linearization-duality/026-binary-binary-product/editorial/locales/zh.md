## 解题思路

为每对交互项 $(i_k, j_k)$ 引入辅助变量 $w_k \in [0, 1]$ 表示二元乘积 $x_{i_k} x_{j_k}$，并加入三条 McCormick 不等式（$w_k \le x_{i_k}$、$w_k \le x_{j_k}$、$w_k \ge x_{i_k} + x_{j_k} - 1$），从而同时精确处理正协同奖励与负冲突惩罚。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} r_i x_i + \sum_{k=0}^{P-1} s_k w_k \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} c_i x_i \le B \\
& w_k \le x_{i_k}, \quad w_k \le x_{j_k}, \quad w_k \ge x_{i_k} + x_{j_k} - 1 && \forall k \in \{0, \dots, P-1\} \\
& x_i \in \{0, 1\}, \quad 0 \le w_k \le 1 && \forall i, k
\end{aligned}
$$

## 核心要点

- **为何当 $s_k$ 正负混合时三条不等式缺一不可**：对于协同项（$s_k > 0$），最大化倾向于推高 $w_k$，必须由 $w_k \le x_{i_k}$ 与 $w_k \le x_{j_k}$ 封顶；对于冲突项（$s_k < 0$），最大化倾向于压低 $w_k$，若漏掉 $w_k \ge x_{i_k} + x_{j_k} - 1$，即使同时选择了 $i_k, j_k$，求解器也会令 $w_k = 0$ 以逃避惩罚。
- **$w_k$ 自动取整数**：由于 $x_{i_k}, x_{j_k} \in \{0, 1\}$，即使将 $w_k$ 声明为 `[0, 1]` 连续变量，上述三条不等式也会自动迫使 $w_k \in \{0, 1\}$。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
m.constraint(
  input.pairs.flatMap(([i, j], k) => [
    expr`${pairProducts[k]} <= ${selected[i]}`,
    expr`${pairProducts[k]} <= ${selected[j]}`,
    expr`${pairProducts[k]} >= ${selected[i]} + ${selected[j]} - 1`,
  ])
);
```

**PuLP (Python)**

```python
prob += pulp.lpDot(costs, selected) <= budget
for k, (i, j, _) in enumerate(pairs):
    prob += pair_products[k] <= selected[i]
    prob += pair_products[k] <= selected[j]
    prob += pair_products[k] >= selected[i] + selected[j] - 1
```
