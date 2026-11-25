## Approach

Model 1D bin packing with binary bin-open indicators $y_k \in \{0, 1\}$ and assignment variables $x_{ik} \in \{0, 1\}$, minimizing $\sum_k y_k$. Eliminate bin permutations by enforcing prefix ordering ($y_k \ge y_{k+1}$ and $x_{ik} = 0$ for $k > i$), then tighten the LP relaxation via the rounded capacity cut $\sum_k y_k \ge \lceil \sum_i w_i / B \rceil$ and extended minimal cover cuts on every bin.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{k=0}^{n-1} y_k \\
\text{s.t.} \quad & \sum_{k=0}^{n-1} x_{ik} = 1 \; (\forall i \in \{0, \dots, n-1\}), \quad x_{ik} = 0 \; (\forall k > i), \quad y_k \ge y_{k+1} \; (\forall k \in \{0, \dots, n-2\}) \\
& \sum_{i=0}^{n-1} w_i x_{ik} \le B y_k && \forall k \\
& \sum_{k=0}^{n-1} y_k \ge \left\lceil \frac{1}{B} \sum_{i=0}^{n-1} w_i \right\rceil \\
& \sum_{i \in E(C)} x_{ik} \le (|C| - 1) y_k && \forall k, \; \forall \text{ minimal cover } C \\
& x_{ik}, y_k \in \{0, 1\}
\end{aligned}
$$

where $E(C) = C \cup \{j : w_j \ge \max_{i \in C} w_i\}$ is the extended cover of $C$.

## Key Points

- **Symmetry breaking**: Without ordering, $m$ used bins have $m!$ identical permutations. Fixing $x_{ik} = 0$ for $k > i$ (which fixes item 0 to bin 0) and $y_k \ge y_{k+1}$ collapses duplicate branch-and-bound subtrees while retaining at least one optimal packing.
- **Extended minimal cover inequalities**: A minimal cover $C$ satisfies $\sum_{i \in C} w_i > B$ and $\sum_{i \in C} w_i - \min_{i \in C} w_i \le B$. No bin can hold $|C|$ items from $E(C)$ because replacing any item in $C$ with an equally heavy or heavier item outside $C$ still exceeds $B$.
- **Tighter LP bounds**: Pairwise 2-covers ($w_i + w_j > B$) together with extended 3-covers and the rounded capacity cut lift weak fractional bounds (such as 2.0 on the example `[6, 6, 6, 2]` with $B = 10$) closer to or equal to the integer optimum.
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Core Building Blocks](?view=guide&lang=en#building-blocks).

## Key Implementation

Generate the prefix ordering constraints with `used.slice(0, -1).map(...)` and the extended minimal cover inequalities via nested `buildExtendedCovers(...).flatMap(...)` and `used.map(...)`, then run `await m.relax()` and `await m.solve()` in sequence. In PuLP, add the same ordering, capacity, and cover constraints in loops over `k` and `covers`, solving both the continuous $[0, 1]$ relaxation and the binary MIP.

**WaSHI (TypeScript)**

```ts
m.constraint(used.slice(0, -1).map((u, k) => expr`${u} >= ${used[k + 1]}`));
m.constraint(expr`sum(${used}) >= ${Math.ceil(totalWeight / input.binCapacity)}`, "global_cap");
m.constraint(
  buildExtendedCovers(input.weights, input.binCapacity).flatMap((cut) =>
    used.map((u, k) => expr`sum(${cut.items.map((i) => assign[i][k])}) <= ${cut.rhsMult} * ${u}`)
  )
);
await m.relax();
const lpBound = m.objectiveValue!;
await m.solve();
```

**PuLP (Python)**

```python
for k in range(n - 1):
    prob += used[k] >= used[k + 1]
prob += pulp.lpSum(used) >= math.ceil(sum(weights) / bin_capacity)
for ext, rhs_mult in covers:
    for k in range(n):
        prob += pulp.lpSum(assign[i][k] for i in ext) <= rhs_mult * used[k]
```
