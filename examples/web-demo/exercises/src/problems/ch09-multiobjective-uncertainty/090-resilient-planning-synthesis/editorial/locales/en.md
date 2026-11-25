## Approach

Combine Chapter 9's modeling idioms into a unified two-stage MIP: enforce Stage-1 capacity resilience via Bertsimas-Sim dual variables ($z, p_j$), link Stage-1 binary commitment $y_j$ to scenario-indexed recovery $w_{s,j}$ via linearized Hamming difference variables $d_{s,j} \ge |w_{s,j} - y_j|$, and include elastic shortfall slacks $u_s \ge 0$ in each scenario.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} F_j y_j + \sum_{s=0}^{S-1} \pi_s \left( C_{\text{sw}} \sum_{j=0}^{n-1} d_{s,j} + C_{\text{sh}} u_s \right) \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} C_j y_j - \Gamma z - \sum_{j=0}^{n-1} p_j \ge C_{\text{rob}} \\
& z + p_j \ge \delta_j y_j && \forall j \\
& w_{s,j} = 0 && \forall (s,j): \text{offline}_{s,j} = 1 \\
& d_{s,j} \ge w_{s,j} - y_j, \quad d_{s,j} \ge y_j - w_{s,j} && \forall s, j \\
& \sum_{j=0}^{n-1} C_j w_{s,j} + u_s \ge D_s && \forall s \\
& y_j, w_{s,j} \in \{0, 1\},\; z, p_j, d_{s,j}, u_s \ge 0 && \forall s, j
\end{aligned}
$$

## Key Points

- **Linearizing Hamming distance between two decision vectors**: Unlike single-stage rescheduling against a fixed baseline schedule, both $y_j$ and $w_{s,j}$ are decision variables here. Introducing $d_{s,j} \ge w_{s,j} - y_j$ and $d_{s,j} \ge y_j - w_{s,j}$ keeps the difference exact and purely linear whenever $C_{\text{sw}} > 0$.
- **Synergy across uncertainty paradigms**: Bertsimas-Sim protection eliminates brittle Stage-1 combinations, stochastic scenario recourse optimizes switching vs. pre-positioning (Case 2), and elastic shortfall avoids forcing extra standby investment for rare extreme shocks.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Register the Stage-1 robust capacity dual constraints via `input.dropAmounts.map(...)`, and generate the linearized Hamming-distance inequality pairs between each scenario's recovery schedule and the initial commitment using `w.flatMap(...)`.

**WaSHI (TypeScript)**

```ts
m.constraint(expr`dot(${input.capacities}, ${y}) - ${input.gamma} * ${z} - sum(${p}) >= ${input.robustMinCap}`);
m.constraint(input.dropAmounts.map((drop, j) => expr`${z} + ${p[j]} >= ${drop} * ${y[j]}`));
m.constraint(
  w.flatMap((row, s) =>
    row.flatMap((wsj, j) => [expr`${diff[s][j]} >= ${wsj} - ${y[j]}`, expr`${diff[s][j]} >= ${y[j]} - ${wsj}`])
  )
);
```

**PuLP (Python)**

```python
prob += pulp.lpDot(capacities, y) - gamma * z - pulp.lpSum(p) >= robust_min_cap
for j in range(n):
    prob += z + p[j] >= drop_amounts[j] * y[j]
for s in range(S):
    for j in range(n):
        prob += diff[s][j] >= w[s][j] - y[j]
        prob += diff[s][j] >= y[j] - w[s][j]
```
