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
- **Fractional optima in continuous LP**: Unlike **#003** where integer constraints narrowed the search to whole numbers, production volumes here are modeled as continuous variables (LP). In an LP whose feasible region is bounded and non-empty, an optimal solution exists at a vertex of the polytope, where constraint intersections can legitimately yield fractional values.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Because the number of flavors and resources varies with the input, generate constraints dynamically with `.map()` (WaSHI) or list/loop iteration (PuLP) and use `dot` / `pulp.lpDot` for concise inner products.

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

**PuLP (Python)**

```python
for k, cap in enumerate(capacities):
    prob += pulp.lpDot(usages[k], quantities) <= cap
prob += pulp.lpDot(margins, quantities)
prob.solve(pulp.HiGHS(msg=False))
```
