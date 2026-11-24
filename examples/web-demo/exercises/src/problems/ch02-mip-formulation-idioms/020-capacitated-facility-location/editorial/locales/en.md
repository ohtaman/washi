## Approach

Pair a binary vector `open[i]` for roastery activation with a continuous matrix `shipments[i][j]` for café store deliveries, gate total outflow per roastery with `sum(shipments[i]) <= capacities[i] * open[i]`, satisfy every café store's demand, and minimize fixed operating plus shipping cost.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{F-1} f_i y_i + \sum_{i=0}^{F-1} \sum_{j=0}^{D-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{D-1} x_{i,j} \le C_i y_i && \forall i \in \{0, \dots, F-1\} \\
& \sum_{i=0}^{F-1} x_{i,j} \ge d_j && \forall j \in \{0, \dots, D-1\} \\
& x_{i,j} \ge 0,\; y_i \in \{0, 1\} && \forall i, j
\end{aligned}
$$

## Key Points

- **Node-level vs. arc-level fixed charge**: Unlike Problem #012 (where every route has a binary switch), CFLP puts binary switches on roastery nodes, linking each roastery's entire row sum $\sum_j x_{i,j}$ to $C_i y_i$.
- **Tightening the LP relaxation (valid inequalities)**: With nonnegative shipping costs $c_{i,j} \ge 0$, adding disaggregated linking constraints $x_{i,j} \le \min(C_i, d_j) y_i$ prunes unnecessary oversupply while preserving an optimal integer solution (and preserves the entire integer feasible set if demand constraints are written as exact equalities `==`), eliminating weak fractional openings ($y_i = d_j / C_i$) at the root node.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Add the linking constraints capping each roastery `i`'s total outflow at `capacities[i] * open[i]` and the column-sum constraints meeting each café store `j`'s demand, and minimize the sum of fixed operating costs and shipping costs.

**WaSHI (TypeScript)**

```ts
m.constraint(
  shipments.map((row, i) => expr`${sum(row)} <= ${input.capacities[i]} * ${open[i]}`)
);
m.constraint(
  input.demands.map(
    (demand, j) => expr`${sum(shipments.map((row) => row[j]))} >= ${demand}`
  )
);
m.objective(
  minimize(expr`dot(${input.fixedCosts}, ${open}) + dot(${input.unitCosts}, ${shipments})`)
);
```

**PuLP (Python)**

```python
for i in range(n_f):
    prob += pulp.lpSum(shipments[i][j] for j in range(n_d)) <= capacities[i] * open_vars[i]
for j in range(n_d):
    prob += pulp.lpSum(shipments[i][j] for i in range(n_f)) >= demands[j]
prob += pulp.lpDot(fixed_costs, open_vars) + pulp.lpSum(
    unit_costs[i][j] * shipments[i][j] for i in range(n_f) for j in range(n_d)
)
```
