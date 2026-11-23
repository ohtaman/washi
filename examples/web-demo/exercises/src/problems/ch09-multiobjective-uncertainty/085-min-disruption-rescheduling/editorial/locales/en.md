## Approach

Create binary schedule variables $x_{it}$, force $x_{it} = 0$ on unavailable entries, enforce slot staffing equalities and worker shift caps, and linearize the Hamming distance against the constant baseline $x^{\text{base}}_{it} \in \{0, 1\}$ directly without extra variables.

## Mathematical Model

$$
\begin{aligned}
\min_{x \in \{0,1\}^{m \times T}} \quad & W \sum_{i,t} \left((1 - x^{\text{base}}_{it}) x_{it} + x^{\text{base}}_{it}(1 - x_{it})\right) + \sum_{i,t} c_i x_{it} \\
\text{s.t.} \quad & x_{it} = 0 && \forall (i,t):\; u_{it} = 1 \\
& \sum_{i=0}^{m-1} x_{it} = D_t && \forall t \in \{0, \dots, T-1\} \\
& \sum_{t=0}^{T-1} x_{it} \le S_i && \forall i \in \{0, \dots, m-1\}
\end{aligned}
$$

## Key Points

- **Zero-overhead Hamming linearization against a constant baseline**: Because $x^{\text{base}}_{it} \in \{0, 1\}$ is fixed input data, $|x_{it} - x^{\text{base}}_{it}|$ equals $x_{it}$ when $x^{\text{base}}_{it} = 0$ and $1 - x_{it}$ when $x^{\text{base}}_{it} = 1$. Both expressions are purely linear—no auxiliary `abs` variables are needed.
- **Cascading swaps & stability vs. cost trade-off**: Tight worker shift caps (`maxShifts`) force multi-worker swaps rather than isolated edits, while `disruptionWeight` controls when stability preserves the baseline (Case 2) versus when large wage differences justify reassignments (Case 4).
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Core Building Blocks](?view=guide&lang=en#building-blocks).

## Key Implementation

Use `x.flatMap(...)` and `x.map(...)` to build linear expressions for the Hamming distance from `baseline` and each worker's assignment cost, then set the objective with `minimize(...)`.

**WaSHI (TypeScript)**

```ts
const hammingExpr = sum(
  x.flatMap((row, i) =>
    row.map((v, t) => {
      const b = input.baseline[i][t];
      return expr`(1 - ${b}) * ${v} + ${b} * (1 - ${v})`;
    })
  )
);
const assignCostExpr = sum(x.map((row, i) => expr`${input.workerCosts[i]} * ${sum(row)}`));
m.objective(minimize(expr`${input.disruptionWeight} * ${hammingExpr} + ${assignCostExpr}`));
```

**PuLP (Python)**

```python
hamming_expr = pulp.lpSum(
    (1 - baseline[i][t]) * x[i][t] + baseline[i][t] * (1 - x[i][t])
    for i in range(m_workers)
    for t in range(n_slots)
)
assign_expr = pulp.lpSum(
    worker_costs[i] * x[i][t] for i in range(m_workers) for t in range(n_slots)
)
prob += disruption_weight * hamming_expr + assign_expr
```
