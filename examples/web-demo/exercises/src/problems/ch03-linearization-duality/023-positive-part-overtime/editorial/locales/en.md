## Approach

Introduce a non-negative slack variable $s_t \ge 0$ for each period representing unmet demand $\max(0, d_t - x_t)$, enforce $s_t \ge d_t - x_t$, and minimize $\sum_t (r_t x_t + p_t s_t)$ under the per-period bounds and aggregate regular cap.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{t=0}^{T-1} \left(r_t x_t + p_t s_t\right) \\
\text{s.t.} \quad & \sum_{t=0}^{T-1} x_t \le \text{totalRegularCap} \\
& s_t \ge d_t - x_t && \forall t \in \{0, \dots, T-1\} \\
& L_t \le x_t \le U_t, \quad s_t \ge 0 && \forall t
\end{aligned}
$$

## Key Points

- **Reverse-sign trap ($s_t \ge x_t - d_t$ vs. $s_t \ge d_t - x_t$)**: Writing $s_t \ge x_t - d_t$ flips the penalty onto *surplus* $\max(0, x_t - d_t)$ instead of *shortage*, letting $x_t$ drop without paying any overtime penalty! Always check the sign when $x_t < d_t$: we need $d_t - x_t > 0$ to force $s_t > 0$.
- **Equality trap ($s_t = d_t - x_t$)**: Writing equality instead of `>=` fails with `INFEASIBLE` whenever $L_t > d_t$ forces $x_t > d_t$ (since $d_t - x_t < 0$ violates $s_t \ge 0$). The inequality $s_t \ge d_t - x_t$ with $s_t \ge 0$ and $p_t > 0$ in minimization settles tightly to $\max(0, d_t - x_t)$.
- Related definitions: [Guide & Glossary — Judge Verdicts](?view=guide&lang=en#verdicts) and [Core Building Blocks](?view=guide&lang=en#building-blocks).

## Key Implementation

Register the aggregate cap on total regular hours and the per-period shortfall inequalities `shortage[t] >= demand - regular[t]`, then minimize the sum of regular costs and overtime penalties.

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
prob += pulp.lpSum(regular) <= total_regular_cap
for t in range(T):
    prob += shortage[t] >= demands[t] - regular[t]
prob += pulp.lpDot(regular_costs, regular) + pulp.lpDot(overtime_penalties, shortage)
prob.solve(pulp.HiGHS(msg=False))
```
