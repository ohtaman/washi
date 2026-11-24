## Approach

Create a binary choice variable `selected[j]` for each candidate set, add one covering inequality per element `i` requiring the sum over sets containing `i` to be at least 1, and minimize total cost.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{m-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j : i \in S_j} x_j \ge 1 && \forall i \in \{0, \dots, n-1\} \\
& x_j \in \{0, 1\} && \forall j \in \{0, \dots, m-1\}
\end{aligned}
$$

## Key Points

- **Why greedy cost-per-element fails**: A large expensive set can look cheapest per newly covered element (for instance `[0, 1, 3, 4]` at cost 8, i.e., 2 per element), forcing a second set just for element 2, whereas two smaller cheaper sets cover everything for less.
- **Covering vs. partitioning**: Using `>= 1` allows elements to be covered multiple times whenever overlapping cheap sets beat any disjoint partition.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Core Building Blocks](?view=guide&lang=en#building-blocks).

## Key Implementation

For each element `i`, filter the selection variables `selected[j]` of packages whose `input.sets[j]` contains `i`, and constrain their sum to be at least 1.

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
