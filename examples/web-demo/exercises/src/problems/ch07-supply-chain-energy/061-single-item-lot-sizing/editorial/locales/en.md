## Approach

Over a $T$-period horizon with demands $d_k$, fixed setup costs $F_t$, unit production costs $c_t$, holding costs $h_t$, and capacities $C_t$, we decide binary setup indicators $y_t$ and disaggregated production flows $w_{t,k} \ge 0$ (units produced in period $t$ to serve demand in period $k \ge t$). Enforcing demand satisfaction, disaggregated setup-linking bounds, and per-period capacity limits yields the **facility-location reformulation**, which minimizes total setup, production, and holding cost while sharing the exact same integer optimum as the standard aggregated model $(x_t, I_t, y_t)$ with a much tighter LP relaxation.

## Mathematical Model

$$
\begin{aligned}
\min_{y \in \{0,1\}^T,\; w \ge 0} \quad & \sum_{t=0}^{T-1} F_t y_t + \sum_{t=0}^{T-1} \sum_{k=t}^{T-1} \left( c_t + \sum_{\tau=t}^{k-1} h_\tau \right) w_{t,k} \\
\text{s.t.} \quad & \sum_{t=0}^{k} w_{t,k} = d_k && \forall k \in \{0,\dots,T-1\} \\
& w_{t,k} \le d_k y_t && \forall 0 \le t \le k < T \\
& \sum_{k=t}^{T-1} w_{t,k} \le C_t y_t && \forall t \in \{0,\dots,T-1\}
\end{aligned}
$$

## Key Points

- **Why disaggregation strengthens the LP bound**: In the aggregated Big-M model $x_t \le C_t y_t$, a large capacity $C_t$ lets the LP relaxation set $y_t = x_t / C_t \ll 1$, charging only a small fraction of $F_t$. Disaggregating to $w_{t,k} \le d_k y_t$ forces $y_t \ge w_{t,k} / d_k$ (for $d_k > 0$), giving the convex hull of uncapacitated lot sizing and cutting branch-and-bound nodes sharply.
- **Recovering $(x_t, I_t)$ from $w_{t,k}$**: Period production is $x_t = \sum_{k=t}^{T-1} w_{t,k}$, and ending inventory is $I_t = \sum_{\tau=0}^t \sum_{k=t+1}^{T-1} w_{\tau,k}$ (automatically satisfying $I_t = I_{t-1} + x_t - d_t$ with $I_{-1} = 0$, as well as $I_{T-1} = 0$).
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Pass the demand-satisfaction, disaggregated upper-bound, and period capacity constraints to `m.constraint()` as arrays. In WaSHI, build each constraint row using `sum()` and `expr` template literals; in PuLP, express the same constraints with `pulp.lpSum` and loops.

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.demands.map((demand, k) =>
    expr`${sum(Array.from({ length: k + 1 }, (_, t) => w[t][k - t]))} == ${demand}`
  )
);
m.constraint(
  w.flatMap((row, t) =>
    row.map((v, offset) => expr`${v} <= ${input.demands[t + offset]} * ${setups[t]}`)
  )
);
m.constraint(
  w.map((row, t) => expr`${sum(row)} <= ${input.capacities[t]} * ${setups[t]}`)
);
```

**PuLP (Python)**

```python
for k in range(T):
    prob += pulp.lpSum(w[(t, k)] for t in range(k + 1)) == demands[k]
for t in range(T):
    prob += pulp.lpSum(w[(t, k)] for k in range(t, T)) <= capacities[t] * setups[t]
    for k in range(t, T):
        prob += w[(t, k)] <= demands[k] * setups[t]
```
