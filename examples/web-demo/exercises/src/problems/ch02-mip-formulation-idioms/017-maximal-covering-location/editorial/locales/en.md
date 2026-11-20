## Approach

Introduce binary facility variables `open[j]` and binary coverage indicators `covered[i]`, limit total open sites to `maxFacilities`, link each zone's coverage to open sites within `coverageRadius`, and maximize covered demand.

## Mathematical Model

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} d_i z_i \\
\text{s.t.} \quad & \sum_{j=0}^{m-1} y_j \le p \\
& z_i \le \sum_{j : \text{dist}_{i,j} \le R} y_j && \forall i \in \{0, \dots, n-1\} \\
& y_j, z_i \in \{0, 1\} && \forall j, i
\end{aligned}
$$

## Key Points

- **Why `covered[i] <= sum(...)` suffices without an upper-bound OR constraint**: Because each `covered[i]` is binary and has a positive objective weight `demands[i] >= 0`, the solver naturally sets `z_i = 1` whenever at least one nearby site is open, while forcing `z_i = 0` when none is open (including unreachable zones where the neighborhood is empty).
- **MCLP vs. Set Covering**: Set Covering requires covering 100% of elements and minimizes cost; MCLP fixes the facility budget `p` and maximizes the covered demand when complete coverage is impossible or too costly.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${sum(open)} <= ${input.maxFacilities}`, "max_facilities");
m.constraint(
  covered.map((cov, i) =>
    expr`${cov} <= ${sum(open.filter((_, j) => input.distances[i][j] <= input.coverageRadius))}`
  )
);
m.objective(maximize(expr`dot(${input.demands}, ${covered})`));
```

**PuLP (Python)**

```python
prob += pulp.lpSum(open_vars) <= max_facilities
for i in range(n):
    prob += covered[i] <= pulp.lpSum(
        open_vars[j] for j in range(m_sites) if distances[i][j] <= radius
    )
prob += pulp.lpDot(demands, covered)
```
