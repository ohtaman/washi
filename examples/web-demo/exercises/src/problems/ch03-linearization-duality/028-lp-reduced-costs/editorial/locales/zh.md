## 解题思路

为每种工艺的运行量引入非负连续决策变量 $x_j \ge 0$（`lb: 0` 且无上界），在各项最低生产要求约束 $\sum_j A_{kj} x_j \ge r_k$ 下最小化总成本 $\sum_j c_j x_j$。调用 HiGHS 求解该线性规划后，直接读取每个变量的检验数 `v.reducedCost`（WaSHI）或 `v.dj`（PuLP）。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} A_{kj} x_j \ge r_k && [\text{dual } \pi_k \ge 0] \quad \forall k \\
& x_j \ge 0 && \forall j
\end{aligned}
$$

## 核心要点

- **检验数的对偶公式与最优性条件**：利用约束对偶变量 $\pi \ge 0$，各变量的检验数为 $\bar{c}_j = c_j - \sum_k \pi_k A_{kj}$。在带 $x_j \ge 0$ 的最小化 LP 中，KKT 最优性条件保证正在使用的基变量（$x_j > 0$）满足 $\bar{c}_j = 0$，处于下界（$x_j = 0$）的变量满足 $\bar{c}_j \ge 0$；而在**对偶非退化**（原问题最优解唯一）时，非基变量严格满足 $\bar{c}_j > 0$。
- **灵敏度、符号推广与定价含义**：在原问题非退化条件下，于当前最优基内，$\bar{c}_j$ 既是工艺 $j$ 单位成本需降低的最小入基门槛，也是强行将 $x_j$ 从零调高时目标成本的局部边际上升率。更一般地，最小化 LP 中紧贴有限上界的非基变量满足 $\bar{c}_j \le 0$；最大化 LP 中处于下界的非基变量满足 $\bar{c}_j \le 0$，其利润系数需提高 $\lvert\bar{c}_j\rvert$ 才能入基。这一判别条件正是后续章节**列生成算法**的核心。
- 概念参考：[指南与术语表 — 核心要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

使用各工艺的非负变量 `quantities` 注册最低生产要求约束与目标函数，调用 `m.solve()` 后从每个变量提取 `.reducedCost`（PuLP 中为 `.dj`）。

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
for k, req in enumerate(min_requirements):
    prob += pulp.lpDot(yields[k], quantities) >= req
prob += pulp.lpDot(costs, quantities)
prob.solve(pulp.HiGHS(msg=False))
reduced_costs = [0.0 if abs(v.dj) < 1e-9 else float(v.dj) for v in quantities]
```
