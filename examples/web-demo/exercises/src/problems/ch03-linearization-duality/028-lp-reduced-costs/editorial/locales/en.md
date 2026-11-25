## Approach

Introduce one non-negative continuous decision variable $x_j \ge 0$ (`lb: 0`, no upper bound) for each process's operating level, enforce the minimum production requirement constraints $\sum_j A_{kj} x_j \ge r_k$, and minimize total cost $\sum_j c_j x_j$. Solve the LP with HiGHS and read each variable's reduced cost directly from `v.reducedCost` (WaSHI) or `v.dj` (PuLP).

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} A_{kj} x_j \ge r_k && [\text{dual } \pi_k \ge 0] \quad \forall k \\
& x_j \ge 0 && \forall j
\end{aligned}
$$

## Key Points

- **Dual formula & optimality conditions**: Using the constraint duals $\pi \ge 0$, every variable's reduced cost equals $\bar{c}_j = c_j - \sum_k \pi_k A_{kj}$. By KKT optimality in a minimization LP with $x_j \ge 0$, basic variables (and any active variable with $x_j > 0$) satisfy $\bar{c}_j = 0$, while variables at their lower bound ($x_j = 0$) satisfy $\bar{c}_j \ge 0$—with strict $\bar{c}_j > 0$ for non-basic variables under **dual non-degeneracy**.
- **Sensitivity, sign generalization & pricing**: Within the current optimal basis under primal non-degeneracy, $\bar{c}_j$ is both the minimum unit-cost reduction needed for $x_j$ to enter the optimal basis and the local marginal objective penalty per unit if $x_j$ is forced upward from zero. More generally, a non-basic variable at a finite upper bound in minimization has $\bar{c}_j \le 0$; in maximization, a non-basic variable at its lower bound has $\bar{c}_j \le 0$ so its profit must rise by $\lvert\bar{c}_j\rvert$ to enter. This exact pricing condition underlies **Column Generation** in later chapters.
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
for k, req in enumerate(min_requirements):
    prob += pulp.lpDot(yields[k], quantities) >= req
prob += pulp.lpDot(costs, quantities)
prob.solve(pulp.HiGHS(msg=False))
reduced_costs = [0.0 if abs(v.dj) < 1e-9 else float(v.dj) for v in quantities]
```
