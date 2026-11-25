## 解题思路

设候选服务数、区域数和交互对数分别为 $n$（`baseCosts.length`）、$m$（`loads.length`）和 $P$（`pairs.length`），并记基础成本为 $c_i$（`baseCosts[i]`）、交付价值为 $v_i$（`values[i]`）、区域负载为 $a_{ri}$（`loads[r][i]`）、目标负载为 $\tau_r$（`targets[r]`）、偏差权重为 $\beta_r$（`devWeights[r]`）、峰值权重为 $\alpha$（`peakWeight`）、交互对为 $(i_k, j_k, s_k)$（`pairs[k]`）。在二元部署变量 $x_i \in \{0, 1\}$（`selected[i]`）及各区域总负载 $L_r = \sum_{i=0}^{n-1} a_{ri} x_i$ 上，将第 3 章的三项核心线性化技巧融汇进同一个 MIP 模型：峰值负载上境图变量 $t \ge L_r$（`peakLoad`）、非负 L1 偏差拆分变量 $d_r^+ - d_r^- = L_r - \tau_r$，以及针对正负混合交互项的 McCormick 线性化 $w_k = x_{i_k} x_{j_k}$（`pairProducts[k]`）。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_i x_i + \sum_{k=0}^{P-1} s_k w_k + \alpha \, t + \sum_{r=0}^{m-1} \beta_r (d_r^+ + d_r^-) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} v_i x_i \ge \text{minValue} \\
& \sum_{i=0}^{n-1} a_{ri} x_i \le t, \qquad \sum_{i=0}^{n-1} a_{ri} x_i - \tau_r = d_r^+ - d_r^- && \forall r \\
& w_k \le x_{i_k}, \quad w_k \le x_{j_k}, \quad w_k \ge x_{i_k} + x_{j_k} - 1 && \forall k \\
& x_i \in \{0, 1\}, \quad 0 \le w_k \le 1, \quad t, d_r^+, d_r^- \ge 0 && \forall i, k, r
\end{aligned}
$$

## 核心要点

- **模块化组合多种线性化**：$\max_r L_r$、$|L_r - \tau_r|$ 与 $x_i x_j$ 各自对应一组彼此解耦的辅助变量与线性约束模块，可以直接组合成单一可解模型。
- **混合正负交互项需全套 McCormick 约束**：负成本协同（$s_k < 0$）依赖上界 $w_k \le x_{i_k}, w_k \le x_{j_k}$ 防止虚报折扣，正成本冲突（$s_k > 0$）则依赖下界 $w_k \ge x_{i_k} + x_{j_k} - 1$ 防止逃避惩罚。
- 概念参考：[指南与术语表 — 核心要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

除最低价值约束外，分别使用 `flatMap` 批量注册各区域负载的上境图上界与 L1 偏差拆分约束，以及各交互对的 3 条 McCormick 不等式。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`dot(${input.values}, ${selected}) >= ${input.minValue}`, "min_val");
m.constraint(
  input.loads.flatMap((row, r) => [
    expr`dot(${row}, ${selected}) <= ${peakLoad}`,
    expr`dot(${row}, ${selected}) - ${input.targets[r]} == ${dPlus[r]} - ${dMinus[r]}`,
  ])
);
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
prob += pulp.lpDot(values, selected) >= min_value
for r in range(m_zones):
    zone_load = pulp.lpDot(loads[r], selected)
    prob += zone_load <= peak_load
    prob += zone_load - targets[r] == d_plus[r] - d_minus[r]
for k, (i, j, _) in enumerate(pairs):
    prob += pair_products[k] <= selected[i]
    prob += pair_products[k] <= selected[j]
    prob += pair_products[k] >= selected[i] + selected[j] - 1
```
