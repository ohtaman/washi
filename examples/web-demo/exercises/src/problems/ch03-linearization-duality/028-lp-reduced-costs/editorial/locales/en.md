## Approach

Build the standard minimization LP with non-negative variables $x_j \ge 0$ (`lb: 0` and no upper bound), solve with HiGHS, and read each variable's reduced cost directly from `v.reducedCost` (WaSHI) or `v.dj` (PuLP).

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} A_{kj} x_j \ge r_k && [\text{dual } \pi_k \ge 0] \quad \forall k \\
& x_j \ge 0 && \forall j
\end{aligned}
$$

## Key Points

- **Dual formula for reduced cost**: Using the constraint duals $\pi \ge 0$, every variable's reduced cost equals $\bar{c}_j = c_j - \sum_k \pi_k A_{kj}$. Basic variables ($x_j > 0$) satisfy $\bar{c}_j = 0$, while non-basic variables at their lower bound ($x_j = 0$) have $\bar{c}_j > 0$ in a non-degenerate minimization LP.
- **Sensitivity & pricing intuition**: $\bar{c}_j$ is both the minimum cost-coefficient reduction needed for $x_j$ to enter the optimal basis and the marginal objective penalty per unit if $x_j$ is forced upward from zero. This exact pricing condition underlies **Column Generation** in later chapters.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Register the minimum requirement constraints and objective using each process's non-negative variable `quantities`, call `m.solve()`, and extract `.reducedCost` (or `.dj` in PuLP) from each variable.

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.minRequirements.map(
    (req, k) => expr`dot(${input.yields[k]}, ${quantities}) >= ${req}`
  )
);
m.objective(minimize(expr`dot(${input.costs}, ${quantities})`));
await m.solve();
const reducedCosts = quantities.map((v) => v.reducedCost!);
```

**PuLP (Python)**

```python
for k, req in enumerate(min_reqs):
    prob += pulp.lpDot(yields[k], quantities) >= req
prob += pulp.lpDot(costs, quantities)
prob.solve(pulp.HiGHS(msg=False))
reduced_costs = [0.0 if abs(v.dj) < 1e-9 else float(v.dj) for v in quantities]
```
