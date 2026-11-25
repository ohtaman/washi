## 解题思路

采用 Charnes-Cooper 透视变换：令 $t = 1 / (d^\top x + d_0) > 0$ 且 $y = t x \ge 0$。由于有界域上 $d_0 > 0$ 且 $d \ge 0$，可行域上必有 $t > 0$；求解归一化后的单个线性规划，再通过 $x = y / t$ 还原原变量。

## 数学模型

$$
\begin{aligned}
\max \quad & c^\top y + c_0 t \\
\text{s.t.} \quad & d^\top y + d_0 t = 1 \\
& A y \le b t \\
& 0 \le y_j \le u_j t && \forall j \in \{0, \dots, n-1\} \\
& t \ge 0
\end{aligned}
$$

## 核心要点

- **右端常数与上界必须同乘 $t$**：代入 $y = t x$ 后，资源约束 $a_k^\top x \le b_k$ 变为 $a_k^\top y \le b_k t$，变量上界 $x_j \le u_j$ 变为 $y_j \le u_j t$。若漏乘 $t$，会导致原尺度与缩放尺度混用而得出错误解。
- **为何不能只最大化分子**：因为分母 $d^\top x + d_0$ 也随 $x$ 增大，把资源全部用满往往不如控制分母规模的组合效率更高。
- 概念参考：[指南与术语表 — 核心要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

建立将分母归一化为 1 的约束 `cc_norm`，并将资源约束与变量上界的右端项同样乘以标量变量 `t` 后进行注册，最后最大化缩放后的目标函数。

**WaSHI (TypeScript)**

```ts
m.constraint(
  expr`dot(${input.denCoeffs}, ${y}) + ${input.denConst} * ${t} == 1`,
  "cc_norm"
);
m.constraint(
  input.capacities.map((cap, k) => expr`dot(${input.usages[k]}, ${y}) <= ${cap} * ${t}`)
);
m.constraint(input.upperBounds.map((ub, j) => expr`${y[j]} <= ${ub} * ${t}`));
m.objective(maximize(expr`dot(${input.numCoeffs}, ${y}) + ${input.numConst} * ${t}`));
```

**PuLP (Python)**

```python
prob += pulp.lpDot(den_c, y) + den_0 * t == 1
for k, cap in enumerate(caps):
    prob += pulp.lpDot(usages[k], y) <= cap * t
for j, ub in enumerate(ubs):
    prob += y[j] <= ub * t
prob += pulp.lpDot(num_c, y) + num_0 * t
```
