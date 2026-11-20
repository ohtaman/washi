## 解题思路

在每个时间步 $t = 0, \dots, T - 1$，以当前实际库存 $I_t^{\text{real}}$ 为初始状态，基于预测需求 `forecastDemands` 在截断窗口 $[t, \min(T, t + H))$ 上建立并求解前瞻 LP；只执行首步产量 $x_0^*$，随后用实际需求 `actualDemands[t]` 更新实际期末库存 $I_{t+1}^{\text{real}} = \max(0, I_t^{\text{real}} + x_0^* - d_t^{\text{act}})$ 与实际缺口。

## 数学模型

$$
\begin{aligned}
\forall t = 0, \dots, T-1: \quad \min_{x, I, s \ge 0} \quad & \sum_{k=t}^{E-1} \left( c_k x_k + h I_k + p s_k \right) \qquad \left(E = \min(T, t + H)\right) \\
\text{s.t.} \quad & I_{k-1} + x_k + s_k - I_k = \hat{d}_k && \forall k \in \{t, \dots, E-1\} \\
& I_{t-1} = I_t^{\text{real}}, \quad 0 \le x_k \le C_{\text{prod}}
\end{aligned}
$$

## 核心要点

- **短视策略（$H = 1$）、前瞻 MPC 与全知解的差异**：当 $H = 1$ 时看不到后续需求高峰，无法提前备货，导致高额缺口罚金（用例 0 中为 1830 对比 860）；而滚动 MPC 无需预知未来真实需求，只需通过每步实际库存闭环反馈即可稳健应对预测偏差。
- **缺口松弛变量保障逐步求解可行**：在每个前瞻子问题中保留非负缺口变量 $s_k \ge 0$，确保即使预测偏差造成当前库存清零，后续窗口也始终有可行解。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
for (let t = 0; t < T; t++) {
  const end = Math.min(T, t + input.windowLen);
  const L = end - t;
  const m = new Model(`MPC_${t}`);
  const x = m.continuous(L, { lb: 0, ub: input.prodCap, prefix: "x" });
  const inv = m.continuous(L, { lb: 0, prefix: "inv" });
  const sh = m.continuous(L, { lb: 0, prefix: "sh" });
  m.constraint(Array.from({ length: L }, (_, k) =>
    expr`${k === 0 ? invCurr : inv[k - 1]} + ${x[k]} + ${sh[k]} - ${inv[k]} == ${input.forecastDemands[t + k]}`
  ));
  m.objective(minimize(expr`dot(${input.prodCosts.slice(t, end)}, ${x}) + ${input.holdCost} * sum(${inv}) + ${input.shortfallPenalty} * sum(${sh})`));
  await m.solve();
}
```

**PuLP (Python)**

```python
for t in range(T):
    end = min(T, t + window_len)
    L = end - t
    prob = pulp.LpProblem(f"mpc_{t}", pulp.LpMinimize)
    x = [pulp.LpVariable(f"x_{k}", lowBound=0, upBound=prod_cap) for k in range(L)]
    inv = [pulp.LpVariable(f"inv_{k}", lowBound=0) for k in range(L)]
    sh = [pulp.LpVariable(f"sh_{k}", lowBound=0) for k in range(L)]
    for k in range(L):
        prob += (inv_curr if k == 0 else inv[k - 1]) + x[k] + sh[k] - inv[k] == forecasts[t + k]
    prob += pulp.lpDot(prod_costs[t:end], x) + hold_cost * pulp.lpSum(inv) + shortfall_pen * pulp.lpSum(sh)
    prob.solve(pulp.HiGHS(msg=False))
```
