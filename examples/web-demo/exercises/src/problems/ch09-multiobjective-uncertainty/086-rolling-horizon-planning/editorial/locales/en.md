## Approach

Let $I_t^{\text{real}}$ denote the opening inventory of period $t$ (with $I_0^{\text{real}} = \text{initialInventory}$). At each step $t = 0, \dots, T - 1$, build and solve a lookahead LP over the truncated horizon $[t, \min(T, t + H))$ starting from $I_{t-1} = I_t^{\text{real}}$ and using `forecastDemands`. Commit only the current period's production $x_t^*$, observe `actualDemands[t]`, and update the next period's opening inventory $I_{t+1}^{\text{real}} = \max(0, I_t^{\text{real}} + x_t^* - d_t^{\text{act}})$ and realized shortfall $\max(0, d_t^{\text{act}} - I_t^{\text{real}} - x_t^*)$.

## Mathematical Model

$$
\begin{aligned}
\forall t = 0, \dots, T-1: \quad \min_{x, I, s \ge 0} \quad & \sum_{k=t}^{E-1} \left( c_k x_k + h I_k + p s_k \right) \qquad \left(E = \min(T, t + H)\right) \\
\text{s.t.} \quad & I_{t-1} = I_t^{\text{real}} \\
& I_{k-1} + x_k + s_k - I_k = \hat{d}_k && \forall k \in \{t, \dots, E-1\} \\
& 0 \le x_k \le C_{\text{prod}} && \forall k \in \{t, \dots, E-1\}
\end{aligned}
$$

## Key Points

- **Myopic ($H = 1$) vs. Lookahead ($H > 1$) vs. Clairvoyant ($H = T$ with perfect foresight)**: A myopic policy ($H = 1$) fails to pre-build inventory ahead of demand spikes exceeding `prodCap`, incurring heavy shortfall penalties (1830 vs. 860 in Case 0). Conversely, re-solving step by step with realized feedback allows MPC to absorb forecast mismatches without needing clairvoyant knowledge of `actualDemands`.
- **State feedback prevents horizon infeasibility**: Including non-negative elastic shortfall variables $s_k \ge 0$ guarantees that every rolling LP remains feasible even when actual demand temporarily exceeds planned supply.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

For each period `t`, build a `Model` over the lookahead window of length `L`, register all inventory balance constraints at once with `Array.from({ length: L }, ...)`, commit only the first-period production quantity `x[0]`, and advance the realized inventory against actual demand.

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
  const xt = x[0].value!;
  const realizedShort = Math.max(0, input.actualDemands[t] - (invCurr + xt));
  invCurr = Math.max(0, invCurr + xt - input.actualDemands[t]);
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
        prob += (inv_curr if k == 0 else inv[k - 1]) + x[k] + sh[k] - inv[k] == forecast_demands[t + k]
    prob += pulp.lpDot(prod_costs[t:end], x) + hold_cost * pulp.lpSum(inv) + shortfall_penalty * pulp.lpSum(sh)
    prob.solve(pulp.HiGHS(msg=False))
    xt = float(pulp.value(x[0]))
    realized_short = max(0.0, actual_demands[t] - (inv_curr + xt))
    inv_curr = max(0.0, inv_curr + xt - actual_demands[t])
```
