## Approach

Declare integer decision variables with individual upper bounds (`[0, maxCounts[i]]`), enforce the single bag weight constraint `dot(weights, counts) <= maxWeight`, and maximize `dot(values, counts)`.

## Mathematical Model

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} w_i x_i \le W_{\max} \\
& x_i \in \{0, 1, \dots, u_i\} && \forall i
\end{aligned}
$$

## Key Points

- **Integer vs. continuous**: With continuous variables (LP relaxation), a solver could take fractional pieces such as `1.75` of an item to achieve a higher but physically invalid objective. Switching to integer variables turns the model into a Mixed-Integer Program (**MIP**).
- **Safe integer extraction**: Solver floating-point tolerances can produce `1.999999999` or `-0` for integer variables, so normalize outputs with `Math.round(v.value!) || 0` (`round(pulp.value(c))` in Python).
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const counts = input.maxCounts.map((cap, i) =>
  m.integer(`item_${i}`, { lb: 0, ub: cap })
);
m.constraint(
  expr`dot(${input.weights}, ${counts}) <= ${input.maxWeight}`,
  "weight_limit"
);
```

**PuLP (Python)**

```python
counts = [
    pulp.LpVariable(f"item_{i}", lowBound=0, upBound=cap, cat=pulp.LpInteger)
    for i, cap in enumerate(max_counts)
]
prob += pulp.lpDot(weights, counts) <= maxWeight
```
