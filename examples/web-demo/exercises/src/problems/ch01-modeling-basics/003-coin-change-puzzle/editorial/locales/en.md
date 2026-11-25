## Approach

Let $x_i \in \{0, 1, \dots, u_i\}$ ($i \in \{0, \dots, n-1\}$) be an integer decision variable representing how many coins of denomination $i$ are used, where $d_i$ (`denominations[i]`) is the face value, $u_i$ (`maxCounts[i]`) is the stock limit, and $T$ (`targetAmount`) is the target amount. Enforce the exact target sum with an equality constraint and minimize the total number of coins.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} d_i x_i = T \\
& x_i \in \{0, 1, \dots, u_i\} && \forall i
\end{aligned}
$$

## Key Points

- **Integer vs. continuous**: With continuous variables (LP relaxation), a solver could take fractional coins such as 1.5 of a denomination. Using `m.integer` (`pulp.LpInteger`) turns the problem into a Mixed-Integer Program (**MIP**) so only whole coins are allowed.
- **Why greedy fails**: With non-canonical denominations such as `[1, 3, 4]` for target 6, taking the largest coin first gives $4 + 1 + 1$ (3 coins), whereas the optimal integer solution $3 + 3$ uses only 2 coins.
- **Safe integer extraction**: WaSHI automatically normalizes `Integer`/`Binary` variable values (`v.value!`) to exact integers (including −0 to 0), though rounding `m.objectiveValue!` is still good practice when an integer total is expected. In PuLP, `pulp.value(...)` returns a `float` that can include tiny solver tolerances (such as 1.999999999), so wrap outputs with `round(...)`.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Declare each coin's count as an integer variable in `[0, maxCounts[i]]`, add the exact-sum equality constraint, and set the objective to minimize the total coin count.

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
