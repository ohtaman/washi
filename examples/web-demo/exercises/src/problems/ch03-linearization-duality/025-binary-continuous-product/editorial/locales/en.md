## Approach

Introduce a binary contract decision $b_i \in \{0, 1\}$, a continuous order quantity $x_i \in [L_i, U_i]$, and an auxiliary continuous variable $z_i$ representing the bilinear product $b_i x_i$. Enforce all four Glover/McCormick envelope inequalities so $z_i = 0$ whenever $b_i = 0$ (even when $x_i > 0$) and $z_i = x_i$ whenever $b_i = 1$, subject to meeting total demand while minimizing total base cost plus contract fees minus discounts.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \left(c_i x_i + F_i b_i - d_i z_i\right) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i \ge \text{totalDemand} \\
& L_i b_i \le z_i \le U_i b_i && \forall i \in \{0, \dots, n-1\} \\
& x_i - U_i (1 - b_i) \le z_i \le x_i - L_i (1 - b_i) && \forall i \\
& L_i \le x_i \le U_i, \quad b_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## Key Points

- **Difference from capacity gating ($x_i \le U_i b_i$)**: Here $x_i$ can still be strictly positive ($x_i > 0$) even when $b_i = 0$, because uncontracted suppliers are still purchased at full base price! Only the discounted term $z_i = b_i x_i$ turns off when $b_i = 0$.
- **Exact convex hull**: Over $b_i \in \{0, 1\}$ and $x_i \in [L_i, U_i]$, these four linear inequalities describe the exact convex hull of $\{(b_i, x_i, z_i) : z_i = b_i x_i\}$, tightening the LP relaxation.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Register the total demand lower-bound constraint, then expand the four Glover/McCormick inequalities for each supplier with `flatMap` and pass them together to `m.constraint([...])`.

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${sum(x)} >= ${input.totalDemand}`, "total_demand");
m.constraint(
  input.minOrders.flatMap((L, i) => {
    const U = input.maxOrders[i];
    return [
      expr`${z[i]} >= ${L} * ${b[i]}`,
      expr`${z[i]} <= ${U} * ${b[i]}`,
      expr`${z[i]} >= ${x[i]} - ${U} * (1 - ${b[i]})`,
      expr`${z[i]} <= ${x[i]} - ${L} * (1 - ${b[i]})`,
    ];
  })
);
```

**PuLP (Python)**

```python
prob += pulp.lpSum(x) >= demand
for i in range(n):
    L, U = min_ord[i], max_ord[i]
    prob += z[i] >= L * b[i]
    prob += z[i] <= U * b[i]
    prob += z[i] >= x[i] - U * (1 - b[i])
    prob += z[i] <= x[i] - L * (1 - b[i])
```
