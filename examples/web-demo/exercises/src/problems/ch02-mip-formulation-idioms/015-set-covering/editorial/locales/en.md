## Approach

Treat the $n$ components (`numElements`) as elements $i$ and the $m$ monitoring packages as candidate sets $S_j$ (`sets[j]`) with licensing costs $c_j$ (`costs[j]`). Create a binary choice variable $x_j$ (`selected[j]`) for each package, add one covering inequality per component $i$ requiring the sum over packages containing $i$ to be at least 1, and minimize total licensing cost.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{m-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j : i \in S_j} x_j \ge 1 && \forall i \in \{0, \dots, n-1\} \\
& x_j \in \{0, 1\} && \forall j \in \{0, \dots, m-1\}
\end{aligned}
$$

## Key Points

- **Why greedy heuristics fail**: In the worked example, picking the largest package first (package 4 covering `[0, 1, 3, 4]` at cost 8) leaves component 2 uncovered and forces at least one additional package (cost at least 5, total at least 13 vs. 9 for packages 1 and 2). Even a cost-per-newly-covered-component greedy rule can miss optimal combinations in general when an initially efficient package leaves awkwardly placed uncovered components.
- **Covering vs. partitioning**: Using `>= 1` allows components to be covered by multiple packages whenever overlapping cheap packages beat any disjoint partition.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Core Building Blocks](?view=guide&lang=en#building-blocks).

## Key Implementation

For each component `i`, filter the selection variables `selected[j]` of packages whose `input.sets[j]` contains `i`, and constrain their sum to be at least 1.

**WaSHI (TypeScript)**

```ts
m.constraint(
  Array.from({ length: input.numElements }, (_, i) =>
    expr`${sum(selected.filter((_, j) => input.sets[j].includes(i)))} >= 1`
  )
);
m.objective(minimize(expr`dot(${input.costs}, ${selected})`));
```

**PuLP (Python)**

```python
for i in range(num_elements):
    prob += pulp.lpSum(selected[j] for j in range(m_count) if i in sets[j]) >= 1
prob += pulp.lpDot(costs, selected)
```
