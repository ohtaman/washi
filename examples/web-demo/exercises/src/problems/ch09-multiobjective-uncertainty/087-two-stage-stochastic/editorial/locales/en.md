## Approach

Formulate the deterministic equivalent LP by pairing shared first-stage variables `orders` ($x_j \ge 0$) with scenario-indexed second-stage recourse variables `shortage` ($u_{s,j} \ge 0$) and `leftover` ($v_{s,j} \ge 0$), linked by $x_j + u_{s,j} - v_{s,j} = d_{s,j}$ and weighted by scenario probabilities $p_s$.

## Mathematical Model

$$
\begin{aligned}
\min_{x, u, v \ge 0} \quad & \sum_{j=0}^{n-1} c_j x_j + \sum_{s=0}^{S-1} p_s \sum_{j=0}^{n-1} \left( q_j u_{s,j} - r_j v_{s,j} \right) \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} x_j \le W_{\text{cap}} \\
& x_j + u_{s,j} - v_{s,j} = d_{s,j} && \forall s \in \{0, \dots, S-1\},\; j \in \{0, \dots, n-1\}
\end{aligned}
$$

## Key Points

- **Value of the Stochastic Solution (VSS)**: Replacing uncertain demand with its mean $\bar{d}_j = \sum_s p_s d_{s,j}$ (the deterministic Expected-Value solution) ignores asymmetric shortage vs. salvage costs and warehouse allocation across products, incurring strictly higher expected cost (`196.5` vs. `184` in Case 0).
- **Non-anticipativity & complementarity**: A single vector $x_j$ is shared across all scenarios (non-anticipativity), while $q_j > r_j$ guarantees that at optimality $u_{s,j}$ and $v_{s,j}$ are never both positive for the same $(s, j)$.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(expr`sum(${orders}) <= ${input.warehouseCap}`, "warehouse_cap");
m.constraint(
  input.demands.flatMap((row, s) =>
    row.map((d, j) => expr`${orders[j]} + ${shortage[s][j]} - ${leftover[s][j]} == ${d}`)
  )
);
const stage2Expected = sum(
  input.probs.map((p, s) =>
    expr`${p} * (dot(${input.shortageCosts}, ${shortage[s]}) - dot(${input.salvageValues}, ${leftover[s]}))`
  )
);
m.objective(minimize(expr`dot(${input.orderCosts}, ${orders}) + ${stage2Expected}`));
```

**PuLP (Python)**

```python
prob += pulp.lpSum(orders) <= warehouse_cap
for s in range(S):
    for j in range(n):
        prob += orders[j] + shortage[s][j] - leftover[s][j] == demands[s][j]
stage2_expected = pulp.lpSum(
    probs[s] * (pulp.lpDot(shortage_costs, shortage[s]) - pulp.lpDot(salvage_values, leftover[s]))
    for s in range(S)
)
prob += pulp.lpDot(order_costs, orders) + stage2_expected
```
