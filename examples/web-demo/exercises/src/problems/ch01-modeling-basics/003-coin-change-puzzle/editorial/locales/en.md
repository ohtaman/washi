## Approach

Declare integer decision variables with individual upper bounds (`[0, maxCounts[i]]`), enforce the exact target equality constraint `dot(denominations, counts) == targetAmount`, and minimize `sum(counts)`.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} d_i x_i = T \\
& x_i \in \{0, 1, \dots, u_i\} && \forall i
\end{aligned}
$$

## Key Points

- **Integer vs. continuous**: With continuous variables (LP relaxation), a solver could take fractional coins such as `1.5` of a denomination. Using `m.integer` (`pulp.LpInteger`) turns the problem into a Mixed-Integer Program (**MIP**) so only whole coins are allowed.
- **Why greedy fails**: With non-canonical denominations such as `[1, 3, 4]` for target `6`, taking the largest coin first gives `4 + 1 + 1` (3 coins), whereas the optimal integer solution `3 + 3` uses only 2 coins.
- **Safe integer extraction**: Solver floating-point tolerances can produce `1.999999999` or `-0`, so normalize outputs with `Math.round(v.value!) || 0` (`round(pulp.value(c))` in Python).
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const counts = input.maxCounts.map((cap, i) =>
  m.integer(`coin_${i}`, { lb: 0, ub: cap })
);
m.constraint(
  expr`dot(${input.denominations}, ${counts}) == ${input.targetAmount}`,
  "exact_target"
);
m.objective(minimize(expr`sum(${counts})`));
```

**PuLP (Python)**

```python
counts = [
    pulp.LpVariable(f"coin_{i}", lowBound=0, upBound=cap, cat=pulp.LpInteger)
    for i, cap in enumerate(max_counts)
]
prob += pulp.lpDot(denominations, counts) == target_amount
prob += pulp.lpSum(counts)
```
