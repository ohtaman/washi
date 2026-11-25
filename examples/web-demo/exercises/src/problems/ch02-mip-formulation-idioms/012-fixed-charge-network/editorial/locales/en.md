## Approach

Declare an $m \times n$ binary matrix `open` and a matching continuous matrix `shipments`, couple every route with `shipments[i][j] <= capacities[i][j] * open[i][j]`, keep the supply and demand balance constraints from pure transportation, and minimize total fixed plus variable cost.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{m-1} \sum_{j=0}^{n-1} \left( F_{i,j} y_{i,j} + c_{i,j} x_{i,j} \right) \\
\text{s.t.} \quad & 0 \le x_{i,j} \le C_{i,j} y_{i,j} && \forall i \in \{0, \dots, m-1\},\; j \in \{0, \dots, n-1\} \\
& \sum_{j=0}^{n-1} x_{i,j} \le S_i && \forall i \in \{0, \dots, m-1\} \\
& \sum_{i=0}^{m-1} x_{i,j} \ge D_j && \forall j \in \{0, \dots, n-1\} \\
& y_{i,j} \in \{0, 1\} && \forall i, j
\end{aligned}
$$

## Key Points

- **Fixed-charge vs. pure LP transportation**: Adding $F_{i,j} y_{i,j}$ turns the pure transportation LP into a MIP and encourages flow consolidation—even a route with a lower per-ton cost `unitCosts[i][j]` may be skipped when its fixed contract fee `fixedCosts[i][j]` outweighs the per-ton savings.
- **Tight route Big-M**: Using the actual route capacity $C_{i,j}$ (rather than an arbitrary huge number) as the coefficient on $y_{i,j}$ gives the tightest route-level LP relaxation, and automatically blocks routes with `capacities[i][j] = 0`.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

For every collection-center and supermarket pair, cap `shipments[i][j]` at `capacities[i][j] * open[i][j]`, and minimize the sum of fixed contract fees and variable shipping costs in the objective.

**WaSHI (TypeScript)**

```ts
m.constraint(
  shipments.flatMap((row, i) =>
    row.map((flow, j) => expr`${flow} <= ${input.capacities[i][j]} * ${open[i][j]}`)
  )
);
m.objective(
  minimize(expr`dot(${input.fixedCosts}, ${open}) + dot(${input.unitCosts}, ${shipments})`)
);
```

**PuLP (Python)**

```python
for i in range(n_s):
    for j in range(n_d):
        prob += shipments[i][j] <= capacities[i][j] * open_vars[i][j]
prob += pulp.lpSum(
    fixed_costs[i][j] * open_vars[i][j] + unit_costs[i][j] * shipments[i][j]
    for i in range(n_s) for j in range(n_d)
)
```
