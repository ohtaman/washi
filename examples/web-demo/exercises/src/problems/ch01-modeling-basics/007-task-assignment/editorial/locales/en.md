## Approach

Create an $n \times n$ binary assignment matrix `x[i][j]`, enforce that every worker row and every task column sums to `1`, and minimize the matrix inner product $\sum_{i,j} c_{i,j} x_{i,j}$.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \sum_{j=0}^{n-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} x_{i,j} = 1 && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} x_{i,j} = 1 && \forall j \in \{0, \dots, n-1\} \\
& x_{i,j} \in \{0, 1\} && \forall i, j
\end{aligned}
$$

## Key Points

- **Doubly stochastic constraints enforce 1-to-1 matching**: Row sums `== 1` ensure every worker takes one task, and column sums `== 1` ensure every task receives one worker. (Because the assignment constraint matrix is totally unimodular, even continuous relaxation vertices are 0-1 integers.)
- **Extracting the permutation vector**: Read `assignment[i]` by finding the column `j` where `Math.round(cell.value!) === 1` (`round(pulp.value(x[i][j])) == 1` in Python).
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(x.map((row) => expr`${sum(row)} == 1`));
m.constraint(x.map((_, j) => expr`${sum(x.map((row) => row[j]))} == 1`));

const assignment = x.map((row) =>
  row.findIndex((cell) => Math.round(cell.value!) === 1)
);
```

**Python (PuLP)**

```python
for i in range(n):
    prob += pulp.lpSum(x[i][j] for j in range(n)) == 1
for j in range(n):
    prob += pulp.lpSum(x[i][j] for i in range(n)) == 1

assignment = [
    next(j for j in range(n) if round(pulp.value(x[i][j])) == 1)
    for i in range(n)
]
```
