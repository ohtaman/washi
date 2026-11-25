## 解题思路

将每台发电机组的发电量建模为连续决策变量 $x_i \in [0, u_i]$（以 `capacities[i]` 作为变量上界 `ub`），在各地区最低需求约束（`>=`）与燃料/排放配额上限约束（`<=`）下最小化总发电成本 $\sum_i c_i x_i$。由于各行约束的对偶变量对应最优成本对右端项的边际灵敏度，在构建模型时保留需求约束与上限约束的对象引用，调用 HiGHS 求解后分别读取 `c.dual`（WaSHI）或 `c.pi`（PuLP）。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} A_{ki} x_i \ge r_k && [\text{dual } y_k \ge 0] \quad \forall k \\
& \sum_{i=0}^{n-1} E_{li} x_i \le b_l && [\text{dual } \mu_l \le 0] \quad \forall l \\
& 0 \le x_i \le u_i && \forall i
\end{aligned}
$$

## 核心要点

- **最小化 LP 中影子价格的符号与局部有效性**：在非退化最优解处，影子价格在当前最优基内局部等于边际变化率 $\partial z^* / \partial \text{rhs}$（若原问题最优解退化，对偶最优解可能不唯一，左右单侧变化率也可能不同）。提高紧致的 `>=` 最低需求 $r_k$ 会收紧可行域、使最小成本不可能下降，故 $y_k \ge 0$；提高紧致的 `<=` 配额上限 $b_l$ 会放宽可行域、使最小成本不可能上升，故 $\mu_l \le 0$。在 `minimize` / `LpMinimize` 中，WaSHI 的 `c.dual` 与 PuLP（HiGHS）的 `c.pi` 均直接报告这一 $\partial z^* / \partial \text{rhs}$ 导数符号。
- **互补松弛性与变量上界**：存在正松弛量的非紧致约束影子价格必为 $0$；将 `capacities[i]` 放在变量 `ub` 而非显式行约束中，可确保行对偶变量与 `minRequirements` 和 `maxResources` 一一对应。
- 概念参考：[指南与术语表 — 核心要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

将最低需求约束与燃料/排放配额上限约束的句柄分别保存在数组中并调用 `m.solve()`，求解后按顺序读取每条约束的 `.dual`（PuLP 中为 `.pi`）。

**WaSHI (TypeScript)**

```ts
const reqConstrs = input.minRequirements.map((req, k) =>
  m.constraint(expr`dot(${input.yields[k]}, ${quantities}) >= ${req}`, `req_${k}`)
);
const capConstrs = input.maxResources.map((cap, l) =>
  m.constraint(expr`dot(${input.resourceUsages[l]}, ${quantities}) <= ${cap}`, `cap_${l}`)
);
m.objective(minimize(expr`dot(${input.costs}, ${quantities})`));
await m.solve();
const duals = [...reqConstrs, ...capConstrs].map((c) => c.dual!);
```

**PuLP (Python)**

```python
req_constrs = [pulp.lpDot(yields[k], quantities) >= req for k, req in enumerate(min_requirements)]
cap_constrs = [pulp.lpDot(resource_usages[l], quantities) <= cap for l, cap in enumerate(max_resources)]
for con in req_constrs + cap_constrs:
    prob += con
prob += pulp.lpDot(costs, quantities)
prob.solve(pulp.HiGHS(msg=False))
duals = [0.0 if abs(c.pi) < 1e-9 else float(c.pi) for c in req_constrs + cap_constrs]
```
