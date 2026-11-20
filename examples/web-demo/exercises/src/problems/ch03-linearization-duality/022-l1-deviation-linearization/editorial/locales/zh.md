## 解题思路

将每个渠道的有符号偏差 $x_i - \tau_i$ 拆分为非负正偏差 $d_i^+ \ge 0$ 与非负负偏差 $d_i^- \ge 0$ 之差，即 $x_i - \tau_i = d_i^+ - d_i^-$。由于惩罚权重 $w_i > 0$，最小化 $\sum_i w_i (d_i^+ + d_i^-)$ 会在最优解处自动确保 $d_i^+ + d_i^- = |x_i - \tau_i|$。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} w_i (d_i^+ + d_i^-) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i = \text{totalOutput}, \qquad \sum_{i=0}^{n-1} c_i x_i \le \text{budget} \\
& x_i - \tau_i = d_i^+ - d_i^- && \forall i \in \{0, \dots, n-1\} \\
& 0 \le x_i \le u_i, \quad d_i^+, d_i^- \ge 0 && \forall i
\end{aligned}
$$

## 核心要点

- **为何无需整数变量即可保证 $d_i^+$ 与 $d_i^-$ 不同时为正**：若将两者同时增加 $\delta > 0$，差值 $d_i^+ - d_i^-$ 保持不变，但目标函数会严格增加 $2 w_i \delta > 0$。因此最小化压力必然将其中至少一个压至 $0$，从而精确实现 $|x_i - \tau_i| = d_i^+ + d_i^-$。
- **防止遗漏负向偏差**：若只写 $d_i \ge x_i - \tau_i$，低于目标值（$x_i < \tau_i$）的偏差将逃避惩罚，因此必须同时表示上下两个方向。
- 概念参考：[指南与术语表 — 核心要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${sum(allocations)} == ${input.totalOutput}`, "total_output");
m.constraint(expr`dot(${input.costs}, ${allocations}) <= ${input.budget}`, "budget");
m.constraint(
  input.targets.map(
    (target, i) => expr`${allocations[i]} - ${target} == ${dPlus[i]} - ${dMinus[i]}`
  )
);
m.objective(
  minimize(expr`dot(${input.weights}, ${dPlus}) + dot(${input.weights}, ${dMinus})`)
);
```

**PuLP (Python)**

```python
prob += pulp.lpSum(allocations) == total_output
prob += pulp.lpDot(costs, allocations) <= budget
for i in range(n):
    prob += allocations[i] - targets[i] == d_plus[i] - d_minus[i]
prob += pulp.lpDot(weights, d_plus) + pulp.lpDot(weights, d_minus)
prob.solve(pulp.HiGHS(msg=False))
```
