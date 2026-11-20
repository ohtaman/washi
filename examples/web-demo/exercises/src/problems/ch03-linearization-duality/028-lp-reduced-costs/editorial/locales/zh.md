## 解题思路

以非负变量 $x_j \ge 0$（`lb: 0` 且无上界）构建标准最小化线性规划，调用 HiGHS 求解后直接读取每个变量的检验数 `v.reducedCost`（WaSHI）或 `v.dj`（PuLP）。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} A_{kj} x_j \ge r_k && [\text{dual } \pi_k \ge 0] \quad \forall k \\
& x_j \ge 0 && \forall j
\end{aligned}
$$

## 核心要点

- **检验数的对偶表达式**：利用约束对偶变量 $\pi \ge 0$，各变量的检验数为 $\bar{c}_j = c_j - \sum_k \pi_k A_{kj}$。正在使用的基变量（$x_j > 0$）满足 $\bar{c}_j = 0$，而在非退化最小化 LP 中处于下界 $x_j = 0$ 的非基变量严格满足 $\bar{c}_j > 0$。
- **灵敏度与定价含义**：$\bar{c}_j$ 既是工艺 $j$ 降价后能够入基的最小降幅门槛，也是强行将 $x_j$ 从零增加一单位时目标成本的边际上升率；这一判别条件正是后续章节**列生成算法**的核心。
- 概念参考：[指南与术语表 — 核心要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.minRequirements.map(
    (req, k) => expr`dot(${input.yields[k]}, ${quantities}) >= ${req}`
  )
);
m.objective(minimize(expr`dot(${input.costs}, ${quantities})`));
await m.solve();
const reducedCosts = quantities.map((v) => v.reducedCost!);
```

**PuLP (Python)**

```python
for k, req in enumerate(min_reqs):
    prob += pulp.lpDot(yields[k], quantities) >= req
prob += pulp.lpDot(costs, quantities)
prob.solve(pulp.HiGHS(msg=False))
reduced_costs = [0.0 if abs(v.dj) < 1e-9 else float(v.dj) for v in quantities]
```
