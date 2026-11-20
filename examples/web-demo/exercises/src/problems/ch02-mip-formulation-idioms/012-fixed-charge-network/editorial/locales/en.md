## Approach

Declare an $S \times D$ binary matrix `open` and a matching continuous matrix `shipments`, couple every arc with `shipments[i][j] <= capacities[i][j] * open[i][j]`, keep the supply and demand balance constraints from pure transportation, and minimize total fixed plus variable cost.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{S-1} \sum_{j=0}^{D-1} \left( F_{i,j} y_{i,j} + c_{i,j} x_{i,j} \right) \\
\text{s.t.} \quad & 0 \le x_{i,j} \le C_{i,j} y_{i,j} && \forall i, j \\
& \sum_{j=0}^{D-1} x_{i,j} \le S_i && \forall i \\
& \sum_{i=0}^{S-1} x_{i,j} \ge D_j && \forall j \\
& y_{i,j} \in \{0, 1\} && \forall i, j
\end{aligned}
$$

## Key Points

- **Fixed-charge vs. pure LP transportation**: Adding $F_{i,j} y_{i,j}$ breaks total unimodularity and encourages flow consolidation—even a lane with a lower unit rate `unitCosts[i][j]` may be skipped when its fixed setup fee `fixedCosts[i][j]` outweighs the per-unit savings.
- **Tight arc Big-M**: Using the actual lane capacity $C_{i,j}$ (rather than an arbitrary huge number) as the coefficient on $y_{i,j}$ gives the tightest arc-level LP relaxation, and automatically blocks lanes with `capacities[i][j] = 0`.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

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
