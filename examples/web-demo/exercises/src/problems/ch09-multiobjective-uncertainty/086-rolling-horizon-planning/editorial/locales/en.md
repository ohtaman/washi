## Approach

At each time step $t = 0, \dots, T - 1$, build and solve a lookahead LP over the truncated horizon $[t, \min(T, t + H))$ using `forecastDemands` and the current realized inventory $I_t^{\text{real}}$. Commit only the first-step production $x_0^*$, observe `actualDemands[t]`, and update realized inventory $I_{t+1}^{\text{real}} = \max(0, I_t^{\text{real}} + x_0^* - d_t^{\text{act}})$ and realized shortfall.

## Mathematical Model

$$
\begin{aligned}
\forall t = 0, \dots, T-1: \quad \min_{x, I, s \ge 0} \quad & \sum_{k=t}^{E-1} \left( c_k x_k + h I_k + p s_k \right) \qquad \left(E = \min(T, t + H)\right) \\
\text{s.t.} \quad & I_{k-1} + x_k + s_k - I_k = \hat{d}_k && \forall k \in \{t, \dots, E-1\} \\
& I_{t-1} = I_t^{\text{real}}, \quad 0 \le x_k \le C_{\text{prod}}
\end{aligned}
$$

## Key Points

- **Myopic ($H = 1$) vs. Lookahead ($H > 1$) vs. Clairvoyant ($H = T$ with perfect foresight)**: A myopic policy ($H = 1$) fails to pre-build inventory ahead of demand spikes exceeding `prodCap`, incurring heavy shortfall penalties (1830 vs. 860 in Case 0). Conversely, re-solving step by step with realized feedback allows MPC to absorb forecast mismatches without needing clairvoyant knowledge of `actualDemands`.
- **State feedback prevents horizon infeasibility**: Including non-negative elastic shortfall variables $s_k \ge 0$ guarantees that every rolling LP remains feasible even when actual demand temporarily exceeds planned supply.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

For each period `t`, build a `Model` over the lookahead window of length `L`, register all inventory balance constraints at once with `Array.from({ length: L }, ...)`, and commit only the first-period production quantity.

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
