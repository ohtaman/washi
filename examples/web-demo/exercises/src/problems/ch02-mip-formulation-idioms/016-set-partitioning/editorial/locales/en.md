## Approach

Declare binary variables `selected[j]` for candidate routes, tighten the element-coverage constraints from inequalities (`>= 1`) to exact equalities (`== 1`), and minimize total route cost.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{m-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j : i \in R_j} x_j = 1 && \forall i \in \{0, \dots, n-1\} \\
& x_j \in \{0, 1\} && \forall j \in \{0, \dots, m-1\}
\end{aligned}
$$

## Key Points

- **Equality vs. inequality makes a real cost difference**: In the worked example, choosing routes 0 (`[0, 1, 2]`, cost `5`) and 1 (`[2, 3, 4]`, cost `5`) would cost only `10` as a Set Cover, but covers task `2` twice; exact partitioning (`== 1`) rejects that overlap and chooses routes 1 and 2 for `11`.
- **Standard backbone for airline crew pairing and VRP**: Replacing `>= 1` with `== 1` turns covering into exact partitioning, the master-problem structure used in column generation and crew scheduling.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(
  Array.from({ length: input.numTasks }, (_, i) =>
    expr`${sum(selected.filter((_, j) => input.routes[j].includes(i)))} == 1`
  )
);
m.objective(minimize(expr`dot(${input.costs}, ${selected})`));
```

**PuLP (Python)**

```python
for i in range(num_tasks):
    prob += pulp.lpSum(selected[j] for j in range(m_count) if i in routes[j]) == 1
prob += pulp.lpDot(costs, selected)
```
