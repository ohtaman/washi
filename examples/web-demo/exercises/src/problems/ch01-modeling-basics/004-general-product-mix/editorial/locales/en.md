## Approach

Declare one non-negative continuous variable array `quantities` matching `margins.length`, map each resource row `usages[k]` to a linear `dot(...) <= capacities[k]` constraint, and maximize `dot(margins, quantities)`.

## Mathematical Model

$$
\begin{aligned}
\max \quad & \sum_{j=0}^{n-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} a_{k,j} x_j \le b_k && \forall k \in \{0, \dots, m-1\} \\
& x_j \ge 0 && \forall j \in \{0, \dots, n-1\}
\end{aligned}
$$

## Key Points

- **Data-driven constraints with `.map()`**: Rather than hardcoding each row as in **#001**, `input.capacities.map(...)` builds all $m$ resource constraints in one array call `m.constraint([...])`.
- **Fractional optima in continuous LP**: Unlike **#003** where integer constraints narrowed the search to whole numbers, production volumes here are continuous real numbers, so the optimal polytope vertex can legitimately take fractional values.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const quantities = m.continuous(input.margins.length, { lb: 0, prefix: "q" });

m.constraint(
  input.capacities.map(
    (cap, k) => expr`dot(${input.usages[k]}, ${quantities}) <= ${cap}`
  )
);
m.objective(maximize(expr`dot(${input.margins}, ${quantities})`));
```

**Python (highspy)**

```python
for k, cap in enumerate(capacities):
    h.addConstr(
        h.qsum(usages[k][j] * quantities[j] for j in range(n_products)) <= cap
    )
h.maximize(h.qsum(margins[j] * quantities[j] for j in range(n_products)))
```
