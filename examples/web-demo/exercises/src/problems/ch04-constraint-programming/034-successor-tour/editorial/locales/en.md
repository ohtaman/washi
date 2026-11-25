## Approach

Represent the tour with $n$ successor variables `next[i]` in `[0, n - 1]` and $n$ visit-order variables `rank[i]` in `[0, n - 1]`. Enforce `distinct(next)`, `next[i] != i`, and `rank` propagation along every non-returning edge (`next[i] != 0 => rank[next[i]] == rank[i] + 1`) so no disconnected subtour can form, then minimize `sum(at(distances[i], next[i]))`.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} d_{i,\, \text{next}_i} \\
\text{s.t.} \quad & \text{AllDifferent}(\text{next}), \quad \text{AllDifferent}(\text{rank}) \\
& \text{next}_i \ne i && \forall i \in \{0, \dots, n-1\} \\
& \text{rank}_0 = 0, \quad \text{rank}_{\text{next}_0} = 1 \\
& \text{next}_i \ne 0 \implies \text{rank}_{\text{next}_i} = \text{rank}_i + 1 && \forall i \in \{1, \dots, n-1\} \\
& \text{next}_i,\, \text{rank}_i \in \{0, \dots, n-1\} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## Key Points

- **Why `distinct(next)` and `next[i] != i` alone fail**: A permutation without fixed points (a derangement) still allows disjoint cycles such as `(0 <-> 1)` and `(2 <-> 3)`. Requiring `rank[next[i]] == rank[i] + 1` on every arc not entering depot 0 makes any disconnected cycle impossible because ranks would have to strictly increase around a loop.
- **Combining `at()` with `implies()`**: Passing the variable array `rank` directly into `at(rank, next[i])` expresses `rank[next[i]]` cleanly in $O(n)$ integer variables, in contrast to $O(n^2)$ binary arc variables and MTZ Big-M inequalities in MIP.
- Related references: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

In addition to `distinct` and no-self-loop constraints on the successor variables `next` and rank variables `rank`, register the constraint that ranks increment by 1 along every non-depot edge using `implies` and `at(rank, nx)`.

**WaSHI (TypeScript)**

```ts
m.constraint(distinct(next), "distinct_next");
m.constraint(distinct(rank), "distinct_rank");
m.constraint(next.map((nx, i) => expr`${nx} != ${i}`));
m.constraint(expr`${rank[0]} == 0`, "rank_start");
m.constraint(expr`at(${rank}, ${next[0]}) == 1`, "rank_first_step");
m.constraint(
  next.slice(1).map((nx, idx) =>
    implies(expr`${nx} != 0`, expr`at(${rank}, ${nx}) == ${rank[idx + 1]} + 1`)
  )
);
m.objective(minimize(sum(input.distances.map((row, i) => at(row, next[i])))));
```
