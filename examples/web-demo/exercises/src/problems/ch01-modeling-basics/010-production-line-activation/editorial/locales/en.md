## Approach

Pair a binary variable array `open` with a non-negative continuous array `quantities`, link each pair via the capacity gate `quantities[i] <= capacities[i] * open[i]`, enforce the resin pellet stock limit, and maximize net profit (gross margin minus fixed costs).

## Mathematical Model

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} m_i q_i - \sum_{i=0}^{n-1} F_i y_i \\
\text{s.t.} \quad & 0 \le q_i \le C_i y_i && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} a_i q_i \le M_{\text{cap}} \\
& y_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## Key Points

- **Capacity gating (foundation of Big-M)**: Multiplying capacity $C_i$ by binary switch $y_i \in \{0, 1\}$ gives $q_i \le 0 \implies q_i = 0$ when closed (`y_i = 0`) and unlocks $0 \le q_i \le C_i$ when open (`y_i = 1`). This bridges Chapter 1's LP and 0-1 models and sets up Big-M & fixed-charge networks in Chapter 2.
- **Fixed-charge vs. variable-profit objective**: Separating `dot(margins, quantities)` from `-dot(fixedCosts, open)` charges setup cost $F_i$ exactly once whenever `open[i] = 1`, independent of how many units are produced on that line.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Link each binary variable `open[i]` with continuous variable `quantities[i]` via `quantities[i] <= capacities[i] * open[i]`, and combine gross margin minus fixed costs into a single objective function.

**WaSHI (TypeScript)**

```ts
m.constraint(
  quantities.map((qty, i) => expr`${qty} <= ${input.capacities[i]} * ${open[i]}`)
);
m.constraint(
  expr`dot(${input.materialUsages}, ${quantities}) <= ${input.materialCap}`,
  "material"
);
m.objective(
  maximize(
    expr`dot(${input.margins}, ${quantities}) - dot(${input.fixedCosts}, ${open})`
  )
);
```

**PuLP (Python)**

```python
for i in range(n):
    prob += quantities[i] <= capacities[i] * open_vars[i]
prob += pulp.lpDot(mat_usages, quantities) <= mat_cap
prob += pulp.lpDot(margins, quantities) - pulp.lpDot(fixed_costs, open_vars)
prob.solve(pulp.HiGHS(msg=False))
```
