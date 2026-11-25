## Approach

Consider $I$ items planned over $T$ periods with demands $d_{i,t}$, fixed setup costs $F_i$, unit holding costs $h_i$, unit processing times $a_i$, setup times $s_i$, and available oven hours $H_t$. For each item $i$ and period $t$, we introduce binary setup indicators $y_{i,t}$, continuous production quantities $x_{i,t} \ge 0$, and ending inventories $I_{i,t} \ge 0$. Coupling these variables through per-item inventory balance, remaining-demand setup-linking bounds, and a shared per-period oven-hour constraint (charging both processing and setup times) minimizes total setup and holding cost.

## Mathematical Model

$$
\begin{aligned}
\min_{y \in \{0,1\}^{I \times T},\; x, I \ge 0} \quad & \sum_{i=0}^{I-1} \sum_{t=0}^{T-1} \left( F_i y_{i,t} + h_i I_{i,t} \right) \\
\text{s.t.} \quad & I_{i,t-1} + x_{i,t} - I_{i,t} = d_{i,t} && \forall i, t \;\; (I_{i,-1} = 0) \\
& x_{i,t} \le \left(\sum_{k=t}^{T-1} d_{i,k}\right) y_{i,t} && \forall i, t \\
& \sum_{i=0}^{I-1} \left( a_i x_{i,t} + s_i y_{i,t} \right) \le H_t && \forall t
\end{aligned}
$$

## Key Points

- **Tight remaining-demand Big-M**: Bounding $x_{i,t}$ by $\sum_{k=t}^{T-1} d_{i,k}$ instead of an arbitrary large constant keeps the LP relaxation tight without cutting off any optimal solution.
- **Setup time consumes oven capacity**: Because $s_i y_{i,t}$ enters the capacity constraint directly, consolidating batches not only saves fixed setup cost $F_i$ but also frees scarce oven hours $s_i$ in bottleneck periods.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

In addition to the per-item, per-period inventory balance equations and remaining-demand setup-linking constraints, construct the capacity constraints that cap total processing and setup time across all items in each period. In WaSHI, build these array constraints with `forEach` and `map`; in PuLP, write the per-period sums using `pulp.lpSum`.

**WaSHI (TypeScript)**

```ts
input.demands.forEach((itemDemands, i) => {
  itemDemands.forEach((demand, t) => {
    const prev = t === 0 ? 0 : inventory[i][t - 1];
    m.constraint(expr`${prev} + ${production[i][t]} - ${inventory[i][t]} == ${demand}`);
    const remDemand = itemDemands.slice(t).reduce((acc, d) => acc + d, 0);
    m.constraint(expr`${production[i][t]} <= ${remDemand} * ${setups[i][t]}`);
  });
});
m.constraint(
  input.capacities.map((cap, t) =>
    expr`${sum(
      input.demands.map(
        (_, i) =>
          expr`${input.unitTimes[i]} * ${production[i][t]} + ${input.setupTimes[i]} * ${setups[i][t]}`
      )
    )} <= ${cap}`
  )
);
```

**PuLP (Python)**

```python
for i in range(n_items):
    for t in range(T):
        prev = 0 if t == 0 else inventory[i][t - 1]
        prob += prev + production[i][t] - inventory[i][t] == demands[i][t]
        prob += production[i][t] <= sum(demands[i][t:]) * setups[i][t]
for t in range(T):
    prob += pulp.lpSum(
        unit_times[i] * production[i][t] + setup_times[i] * setups[i][t]
        for i in range(n_items)
    ) <= capacities[t]
```
