## Approach

Model 1D bin packing with binary bin-open indicators `used[k]` and assignment matrix `assign[i][k]`. Eliminate bin permutations by enforcing prefix ordering (`used[k] >= used[k+1]`, `assign[i][k] = 0` for $k > i$), then tighten the LP relaxation via $\sum_k y_k \ge \lceil \sum_i w_i / B \rceil$ and extended minimal cover cuts on every bin.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{k=0}^{n-1} y_k \\
\text{s.t.} \quad & \sum_{k=0}^{n-1} x_{ik} = 1, \quad x_{ik} = 0 \; (\forall k > i), \quad y_k \ge y_{k+1} \\
& \sum_{i=0}^{n-1} w_i x_{ik} \le B y_k && \forall k \\
& \sum_{k=0}^{n-1} y_k \ge \left\lceil \frac{1}{B} \sum_{i=0}^{n-1} w_i \right\rceil \\
& \sum_{i \in E(C)} x_{ik} \le (|C| - 1) y_k && \forall k, \; \forall \text{ minimal cover } C \\
& x_{ik}, y_k \in \{0, 1\}
\end{aligned}
$$

where $E(C) = C \cup \{j : w_j \ge \max_{i \in C} w_i\}$ is the extended cover of $C$.

## Key Points

- **Symmetry breaking**: Without ordering, $m$ used bins have $m!$ identical permutations. Fixing `assign[i][k] = 0` for $k > i$ (which fixes item 0 to bin 0) and `used[k] >= used[k+1]` collapses duplicate branch-and-bound subtrees while retaining at least one optimal packing.
- **Extended minimal cover inequalities**: A minimal cover $C$ satisfies $\sum_{i \in C} w_i > B$ and $\sum_{i \in C} w_i - \min_{i \in C} w_i \le B$. No bin can hold $|C|$ items from $E(C)$ because replacing any item in $C$ with an equally heavy or heavier item outside $C$ still exceeds $B$.
- **Tighter LP bounds**: Pairwise 2-covers ($w_i + w_j > B$) together with extended 3-covers and the rounded capacity cut lift weak fractional bounds (such as `2.0` on `[6, 6, 6, 2]` or `[4, 4, 4, 4, 4]`) closer to or equal to the integer optimum.
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Core Building Blocks](?view=guide&lang=en#building-blocks).

## Key Implementation

**WaSHI (TypeScript)**

```ts
for (let k = 0; k < n - 1; k++) {
  m.constraint(expr`${used[k]} >= ${used[k + 1]}`, `sym_order_${k}`);
}
m.constraint(expr`sum(${used}) >= ${Math.ceil(totalWeight / input.binCapacity)}`, "global_cap");
for (const cut of buildExtendedCovers(input.weights, input.binCapacity)) {
  for (let k = 0; k < n; k++) {
    m.constraint(expr`sum(${cut.items.map((i) => assign[i][k])}) <= ${cut.rhsMult} * ${used[k]}`);
  }
}
await m.relax();
const lpBound = m.objectiveValue!;
await m.solve();
```

**PuLP (Python)**

```python
for k in range(n - 1):
    prob += used[k] >= used[k + 1]
prob += pulp.lpSum(used) >= math.ceil(sum(weights) / bin_cap)
for ext, rhs_mult in covers:
    for k in range(n):
        prob += pulp.lpSum(assign[i][k] for i in ext) <= rhs_mult * used[k]
```
