## Approach

Pair binary vendor-selection variables $y_s \in \{0, 1\}$ with continuous plant allocations $q_{s,p} \in [0, \alpha D_p]$ so the per-plant concentration cap becomes a simple variable upper bound, while semi-continuous bounds on $\sum_p q_{s,p}$ and a cardinality constraint on $\sum_s y_s$ enforce minimum commitments and vendor count limits.

## Mathematical Model

$$
\begin{aligned}
\min_{y \in \{0,1\}^S,\; q \ge 0} \quad & \sum_{s=0}^{S-1} F_s y_s + \sum_{s=0}^{S-1} \sum_{p=0}^{P-1} c_{s,p} q_{s,p} \\
\text{s.t.} \quad & K_{\min} \le \sum_{s=0}^{S-1} y_s \le K_{\max} \\
& L_s y_s \le \sum_{p=0}^{P-1} q_{s,p} \le U_s y_s && \forall s \\
& \sum_{s=0}^{S-1} q_{s,p} \ge D_p && \forall p \\
& 0 \le q_{s,p} \le \alpha D_p && \forall s, p
\end{aligned}
$$

## Key Points

- **Variable bounds encode diversification cleanly**: Placing $q_{s,p} \le \alpha D_p$ directly in the variable declaration avoids $S \times P$ explicit constraint rows while forcing every plant to split orders across at least $\lceil 1 / \alpha \rceil$ suppliers.
- **Semi-continuous linking at the supplier level**: Combining $L_s y_s \le \sum_p q_{s,p} \le U_s y_s$ with non-negativity ensures $y_s = 0 \implies q_{s,p} = 0$ for every plant $p$ and guarantees minimum order volume $L_s$ whenever $y_s = 1$.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const allocations = input.fixedCosts.map((_, s) =>
  input.demands.map((demand, p) =>
    m.continuous(`q_${s}_${p}`, { lb: 0, ub: input.maxShare * demand })
  )
);
m.constraint(expr`${sum(active)} >= ${input.minSuppliers}`);
m.constraint(expr`${sum(active)} <= ${input.maxSuppliers}`);
allocations.forEach((row, s) => {
  const totalOrder = sum(row);
  m.constraint(expr`${totalOrder} >= ${input.minOrders[s]} * ${active[s]}`);
  m.constraint(expr`${totalOrder} <= ${input.maxOrders[s]} * ${active[s]}`);
});
```

**PuLP (Python)**

```python
prob += pulp.lpSum(active) >= min_suppliers
prob += pulp.lpSum(active) <= max_suppliers
for s in range(n_sup):
    total_order = pulp.lpSum(allocations[s])
    prob += total_order >= min_orders[s] * active[s]
    prob += total_order <= max_orders[s] * active[s]
```
