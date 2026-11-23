## Approach

Combine three Chapter 3 linearization idioms inside one MIP over binary deployment variables $x_i \in \{0, 1\}$: an epigraph peak variable $t \ge L_r$, non-negative L1 deviation pairs $d_r^+ - d_r^- = L_r - \tau_r$, and McCormick bilinear variables $w_k = x_{i_k} x_{j_k}$ for mixed-sign pairwise interactions.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_i x_i + \sum_{k=0}^{P-1} s_k w_k + \alpha \, t + \sum_{r=0}^{m-1} \beta_r (d_r^+ + d_r^-) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} v_i x_i \ge \text{minValue} \\
& \sum_{i=0}^{n-1} a_{ri} x_i \le t, \qquad \sum_{i=0}^{n-1} a_{ri} x_i - \tau_r = d_r^+ - d_r^- && \forall r \\
& w_k \le x_{i_k}, \quad w_k \le x_{j_k}, \quad w_k \ge x_{i_k} + x_{j_k} - 1 && \forall k \\
& x_i \in \{0, 1\}, \quad 0 \le w_k \le 1, \quad t, d_r^+, d_r^- \ge 0 && \forall i, k, r
\end{aligned}
$$

## Key Points

- **Composing linearizations cleanly**: Every nonlinear piece—$\max_r L_r$, $|L_r - \tau_r|$, and $x_i x_j$—maps into its own small block of auxiliary variables and linear constraints without interfering with the rest of the model.
- **Mixed-sign interactions require full McCormick bounds**: Negative $s_k$ (cost savings) push $w_k$ up and rely on $w_k \le x_{i_k}, w_k \le x_{j_k}$; positive $s_k$ (interference overhead) push $w_k$ down and rely on $w_k \ge x_{i_k} + x_{j_k} - 1$.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

In addition to the minimum value constraint, register in bulk using `flatMap` both the epigraph cap and L1 deviation split for each zone's load, as well as the three McCormick inequalities for each pair.

**WaSHI (TypeScript)**

```ts
m.constraint(expr`dot(${input.values}, ${selected}) >= ${input.minValue}`, "min_val");
m.constraint(
  input.loads.flatMap((row, r) => [
    expr`dot(${row}, ${selected}) <= ${peakLoad}`,
    expr`dot(${row}, ${selected}) - ${input.targets[r]} == ${dPlus[r]} - ${dMinus[r]}`,
  ])
);
m.constraint(
  input.pairs.flatMap(([i, j], k) => [
    expr`${pairProducts[k]} <= ${selected[i]}`,
    expr`${pairProducts[k]} <= ${selected[j]}`,
    expr`${pairProducts[k]} >= ${selected[i]} + ${selected[j]} - 1`,
  ])
);
```

**PuLP (Python)**

```python
prob += pulp.lpDot(values, selected) >= min_value
for r in range(m_zones):
    zone_load = pulp.lpDot(loads[r], selected)
    prob += zone_load <= peak_load
    prob += zone_load - targets[r] == d_plus[r] - d_minus[r]
for k, (i, j, _) in enumerate(pairs):
    prob += pair_products[k] <= selected[i]
    prob += pair_products[k] <= selected[j]
    prob += pair_products[k] >= selected[i] + selected[j] - 1
```
