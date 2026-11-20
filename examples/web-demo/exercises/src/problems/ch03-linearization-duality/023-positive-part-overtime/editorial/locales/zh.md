## 解题思路

为每个周期引入非负松弛变量 $s_t \ge 0$ 表示需求缺口 $\max(0, d_t - x_t)$，加入不等式 $s_t \ge d_t - x_t$，并在单期上下界与总常规产能上限下最小化 $\sum_t (r_t x_t + p_t s_t)$。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{t=0}^{T-1} \left(r_t x_t + p_t s_t\right) \\
\text{s.t.} \quad & \sum_{t=0}^{T-1} x_t \le \text{totalRegularCap} \\
& s_t \ge d_t - x_t && \forall t \in \{0, \dots, T-1\} \\
& L_t \le x_t \le U_t, \quad s_t \ge 0 && \forall t
\end{aligned}
$$

## 核心要点

- **符号写反的常见陷阱（$s_t \ge x_t - d_t$ 与 $s_t \ge d_t - x_t$）**：若误写成 $s_t \ge x_t - d_t$，惩罚项会作用到“超额产出”$\max(0, x_t - d_t)$ 而非“短缺”，导致降低 $x_t$ 时逃避了全部加班惩罚！务必检查当 $x_t < d_t$ 时右侧必须为正。
- **写成等式的常见陷阱（$s_t = d_t - x_t$）**：当淡季保底排班 $L_t > d_t$ 时，必然有 $d_t - x_t < 0$，等式会与 $s_t \ge 0$ 冲突导致 `INFEASIBLE`。使用不等式 $s_t \ge d_t - x_t$ 配合 $p_t > 0$ 的最小化目标，最优解会自动压紧到 $\max(0, d_t - x_t)$。
- 概念参考：[指南与术语表 — 判题结果](?view=guide&lang=zh#verdicts) / [核心要素](?view=guide&lang=zh#building-blocks)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${sum(regular)} <= ${input.totalRegularCap}`, "total_regular");
m.constraint(
  input.demands.map((demand, t) => expr`${shortage[t]} >= ${demand} - ${regular[t]}`)
);
m.objective(
  minimize(
    expr`dot(${input.regularCosts}, ${regular}) + dot(${input.overtimePenalties}, ${shortage})`
  )
);
```

**PuLP (Python)**

```python
prob += pulp.lpSum(regular) <= total_cap
for t in range(T):
    prob += shortage[t] >= demands[t] - regular[t]
prob += pulp.lpDot(reg_costs, regular) + pulp.lpDot(penalties, shortage)
prob.solve(pulp.HiGHS(msg=False))
```
