## 解题思路

为二元变量 $b_i \in \{0, 1\}$ 与有界连续变量 $x_i \in [L_i, U_i]$ 的乘积 $b_i x_i$ 引入辅助连续变量 $z_i$，并使用四条 Glover / McCormick 包络不等式精确刻画：$b_i = 0$ 时强制 $z_i = 0$（同时仍允许 $x_i \ge L_i > 0$），$b_i = 1$ 时强制 $z_i = x_i$。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \left(c_i x_i + F_i b_i - d_i z_i\right) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i \ge \text{totalDemand} \\
& L_i b_i \le z_i \le U_i b_i && \forall i \in \{0, \dots, n-1\} \\
& x_i - U_i (1 - b_i) \le z_i \le x_i - L_i (1 - b_i) && \forall i \\
& L_i \le x_i \le U_i, \quad b_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## 核心要点

- **与普通开关容量约束 $x_i \le U_i b_i$ 的区别**：即使未签合约（$b_i = 0$），仍可以按基础单价采购 $x_i \ge L_i > 0$；被开关控制归零的不是 $x_i$ 本身，而是乘积项 $z_i = b_i x_i$。
- **精确凸包紧致松弛**：上述四条线性不等式恰好构成 $\{(b_i, x_i, z_i) \in \{0,1\}\times[L_i, U_i]\times\mathbb{R} : z_i = b_i x_i\}$ 的凸包，能够提供最紧的 LP 松弛下界。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${sum(x)} >= ${input.totalDemand}`, "total_demand");
m.constraint(
  input.minOrders.flatMap((L, i) => {
    const U = input.maxOrders[i];
    return [
      expr`${z[i]} >= ${L} * ${b[i]}`,
      expr`${z[i]} <= ${U} * ${b[i]}`,
      expr`${z[i]} >= ${x[i]} - ${U} * (1 - ${b[i]})`,
      expr`${z[i]} <= ${x[i]} - ${L} * (1 - ${b[i]})`,
    ];
  })
);
```

**PuLP (Python)**

```python
prob += pulp.lpSum(x) >= demand
for i in range(n):
    L, U = min_ord[i], max_ord[i]
    prob += z[i] >= L * b[i]
    prob += z[i] <= U * b[i]
    prob += z[i] >= x[i] - U * (1 - b[i])
    prob += z[i] <= x[i] - L * (1 - b[i])
```
