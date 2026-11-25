## Approach

Introduce non-negative deviation variables `shortfalls` ($s_j^-$) and `excesses` ($s_j^+$) alongside production `quantities` ($q_j$), split each soft target into the linear balance $q_j + s_j^- - s_j^+ = T_j$, enforce the hard capacity and minimum-output inequalities, and minimize production cost plus weighted deviations.

## Mathematical Model

$$
\begin{aligned}
\min_{q, s^-, s^+ \ge 0} \quad & \sum_{j=0}^{n-1} \left( c_j q_j + w_j^- s_j^- + w_j^+ s_j^+ \right) \\
\text{s.t.} \quad & q_j + s_j^- - s_j^+ = T_j && \forall j \in \{0, \dots, n-1\} \\
& \sum_{j=0}^{n-1} h_j q_j \le H_{\text{cap}} \\
& \sum_{j=0}^{n-1} q_j \ge Q_{\min}
\end{aligned}
$$

## Key Points

- **Elasticizing infeasibility**: Replacing hard $q_j = T_j$ constraints with $q_j + s_j^- - s_j^+ = T_j$ keeps the model feasible whenever the hard constraints (`machineCap` and `minTotal`) are mutually compatible—even when $H_{\text{cap}}$ or $Q_{\min}$ conflicts with the targets—while tiered penalties $w_j^-$ automatically sacrifice the lowest-priority targets first.
- **Zero-overlap guarantee**: Because $w_j^-, w_j^+ \ge 0$ with $w_j^- + w_j^+ > 0$, an optimal LP solution will never make both $s_j^- > 0$ and $s_j^+ > 0$ simultaneously, since subtracting $\min(s_j^-, s_j^+)$ from both strictly lowers cost without changing $q_j$.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Verdicts](?view=guide&lang=en#verdicts).

## Key Implementation

Register all product target balance equations at once using `input.targets.map(...)` with `shortfalls` and `excesses` slacks, and express the machine capacity, minimum total output, and objective concisely with `dot` and `sum`.

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.targets.map(
    (target, j) => expr`${quantities[j]} + ${shortfalls[j]} - ${excesses[j]} == ${target}`
  )
);
m.constraint(expr`dot(${input.hours}, ${quantities}) <= ${input.machineCap}`, "machine_cap");
m.constraint(expr`sum(${quantities}) >= ${input.minTotal}`, "min_total");
m.objective(
  minimize(
    expr`dot(${input.unitCosts}, ${quantities}) + dot(${input.shortfallPenalties}, ${shortfalls}) + dot(${input.excessPenalties}, ${excesses})`
  )
);
```

**PuLP (Python)**

```python
for j in range(n):
    prob += quantities[j] + shortfalls[j] - excesses[j] == targets[j]
prob += pulp.lpDot(hours, quantities) <= machine_cap
prob += pulp.lpSum(quantities) >= min_total
prob += (
    pulp.lpDot(unit_costs, quantities)
    + pulp.lpDot(shortfall_penalties, shortfalls)
    + pulp.lpDot(excess_penalties, excesses)
)
prob.solve(pulp.HiGHS(msg=False))
```
