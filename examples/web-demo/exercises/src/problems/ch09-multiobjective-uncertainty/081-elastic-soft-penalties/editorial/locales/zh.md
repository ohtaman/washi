## 解题思路

在产量变量 `quantities` ($q_j$) 之外引入非负欠产变量 `shortfalls` ($s_j^-$) 与超产变量 `excesses` ($s_j^+$)，将每项软目标写为弹性平衡等式 $q_j + s_j^- - s_j^+ = T_j$，在严格满足机器产能与最低产量下限的同时最小化生产成本与加权偏离惩罚之和。

## 数学模型

$$
\begin{aligned}
\min_{q, s^-, s^+ \ge 0} \quad & \sum_{j=0}^{n-1} \left( c_j q_j + w_j^- s_j^- + w_j^+ s_j^+ \right) \\
\text{s.t.} \quad & q_j + s_j^- - s_j^+ = T_j && \forall j \in \{0, \dots, n-1\} \\
& \sum_{j=0}^{n-1} h_j q_j \le H_{\text{cap}} \\
& \sum_{j=0}^{n-1} q_j \ge Q_{\min}
\end{aligned}
$$

## 核心要点

- **化解冲突硬约束的弹性建模**：若直接写死 $q_j = T_j$，当 $H_{\text{cap}}$ 或 $Q_{\min}$ 与目标冲突时模型会立即变为 `INFEASIBLE`；改写为弹性等式 $q_j + s_j^- - s_j^+ = T_j$ 后，只要硬约束（`machineCap` 与 `minTotal`）本身相容，模型即可保持可行，并借助分层权重 $w_j^-$ 自动按优先级先削减低权重产品。
- **正负偏差不会同时为正**：只要 $w_j^-, w_j^+ \ge 0$ 且 $w_j^- + w_j^+ > 0$，将 $s_j^-$ 与 $s_j^+$ 同时减去 $\min(s_j^-, s_j^+)$ 既不改变 $q_j$ 又严格降低目标值，因此线性规划最优解天然保持两者至少其一为零。
- 概念参考：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [判题结果与求解状态](?view=guide&lang=zh#verdicts)

## 实现要点

使用 `input.targets.map(...)` 将欠产松弛变量 `shortfalls` 与超产松弛变量 `excesses` 组合，一次性注册所有产品的目标平衡等式，并用 `dot` 与 `sum` 简洁表达机器产能上限、总产量下限和目标函数。

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.targets.map(
    (target, j) => expr`${quantities[j]} + ${shortfalls[j]} - ${excesses[j]} == ${target}`
  )
);
m.constraint(expr`dot(${input.hours}, ${quantities}) <= ${input.machineCap}`, "machine_cap");
m.constraint(expr`sum(${quantities}) >= ${input.minTotal}`, "min_total");
m.objective(
  minimize(
    expr`dot(${input.unitCosts}, ${quantities}) + dot(${input.shortfallPenalties}, ${shortfalls}) + dot(${input.excessPenalties}, ${excesses})`
  )
);
```

**PuLP (Python)**

```python
for j in range(n):
    prob += quantities[j] + shortfalls[j] - excesses[j] == targets[j]
prob += pulp.lpDot(hours, quantities) <= machine_cap
prob += pulp.lpSum(quantities) >= min_total
prob += (
    pulp.lpDot(unit_costs, quantities)
    + pulp.lpDot(shortfall_penalties, shortfalls)
    + pulp.lpDot(excess_penalties, excesses)
)
prob.solve(pulp.HiGHS(msg=False))
```
