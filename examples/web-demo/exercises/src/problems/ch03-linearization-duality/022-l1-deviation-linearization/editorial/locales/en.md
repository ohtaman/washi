## Approach

Split each signed deviation $x_i - \tau_i$ into a non-negative positive part $d_i^+ \ge 0$ and negative part $d_i^- \ge 0$ via $x_i - \tau_i = d_i^+ - d_i^-$. Minimizing the weighted sum $\sum_i w_i (d_i^+ + d_i^-)$ with $w_i > 0$ enforces $d_i^+ + d_i^- = |x_i - \tau_i|$ automatically at optimality.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} w_i (d_i^+ + d_i^-) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i = \text{totalOutput}, \qquad \sum_{i=0}^{n-1} c_i x_i \le \text{budget} \\
& x_i - \tau_i = d_i^+ - d_i^- && \forall i \in \{0, \dots, n-1\} \\
& 0 \le x_i \le u_i, \quad d_i^+, d_i^- \ge 0 && \forall i
\end{aligned}
$$

## Key Points

- **Why $d_i^+$ and $d_i^-$ do not stay simultaneously positive**: Adding a constant $\delta > 0$ to both $d_i^+$ and $d_i^-$ keeps $d_i^+ - d_i^-$ unchanged while strictly increasing the objective by $2 w_i \delta > 0$. Minimization therefore pushes at least one of $d_i^+, d_i^-$ to $0$, giving $d_i^+ + d_i^- = |x_i - \tau_i|$ with no binary variables.
- **Warning against sign omission**: Writing only $d_i \ge x_i - \tau_i$ misses downward deviations ($x_i < \tau_i$); both directions must be penalized.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${sum(allocations)} == ${input.totalOutput}`, "total_output");
m.constraint(expr`dot(${input.costs}, ${allocations}) <= ${input.budget}`, "budget");
m.constraint(
  input.targets.map(
    (target, i) => expr`${allocations[i]} - ${target} == ${dPlus[i]} - ${dMinus[i]}`
  )
);
m.objective(
  minimize(expr`dot(${input.weights}, ${dPlus}) + dot(${input.weights}, ${dMinus})`)
);
```

**PuLP (Python)**

```python
prob += pulp.lpSum(allocations) == total_output
prob += pulp.lpDot(costs, allocations) <= budget
for i in range(n):
    prob += allocations[i] - targets[i] == d_plus[i] - d_minus[i]
prob += pulp.lpDot(weights, d_plus) + pulp.lpDot(weights, d_minus)
prob.solve(pulp.HiGHS(msg=False))
```
