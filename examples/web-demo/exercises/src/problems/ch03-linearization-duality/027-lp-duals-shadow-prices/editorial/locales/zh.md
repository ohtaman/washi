## 解题思路

将产能上限 `capacities[i]` 设为决策变量的上界（`ub`），构建连续最小化线性规划并保留 `>=` 需求约束与 `<=` 资源上限约束的对象引用，调用 HiGHS 求解后分别读取 `c.dual`（WaSHI）或 `c.pi`（PuLP）。

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

- **最小化 LP 中影子价格的正负号**：影子价格即为 $\partial z^* / \partial \text{rhs}$。提高紧致的 `>=` 下限 $r_k$ 会收紧可行域、推高最小成本，故 $y_k \ge 0$；提高紧致的 `<=` 上限 $b_l$ 会放宽可行域、降低最小成本，故 $\mu_l \le 0$。在最小化问题中，WaSHI 的 `c.dual` 与 PuLP（HiGHS）的 `c.pi` 符号完全一致。
- **互补松弛性与变量上界**：存在正松弛量的非紧致约束影子价格必为 $0$；将 `capacities[i]` 放在变量 `ub` 而非显式行约束中，可确保行对偶变量与 `minRequirements` 和 `maxResources` 一一对应。
- 概念参考：[指南与术语表 — 核心要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

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
req_constrs = [pulp.lpDot(yields[k], quantities) >= req for k, req in enumerate(min_reqs)]
cap_constrs = [pulp.lpDot(usages[l], quantities) <= cap for l, cap in enumerate(max_res)]
for con in req_constrs + cap_constrs:
    prob += con
prob += pulp.lpDot(costs, quantities)
prob.solve(pulp.HiGHS(msg=False))
duals = [0.0 if abs(c.pi) < 1e-9 else float(c.pi) for c in req_constrs + cap_constrs]
```
