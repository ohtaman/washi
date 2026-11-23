## Approach

## Approach

Define a **2D binary variable matrix** $x_{i,j} \in \{0, 1\}$ indicating whether courier $i$ covers delivery zone $j$. Constrain every row to have exactly one 1 (sum = 1: one zone per courier) and every column to have exactly one 1 (sum = 1: one courier per zone), and minimize the total cost.

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

- **Exactly-one constraints per row and column**: Summing binary variables to 1 expresses "choose exactly one." Row sums alone allow multiple couriers in the same zone, while column sums alone allow one courier to take multiple zones; enforcing both determines a 1-to-1 permutation. (Because the assignment constraint matrix is totally unimodular, even continuous relaxation vertices are 0-1 integers.)
- **Extracting the assignment indices**: After solving, find the column index `j` in each row `i` where `Math.round(cell.value!) === 1` (`round(pulp.value(x[i][j])) == 1` in Python).
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

Constrain both row sums and column sums of the 2D binary matrix `x` to 1, and after solving, extract the column index whose value is 1 in each row.

**WaSHI (TypeScript)**

```ts
m.constraint(x.map((row) => expr`${sum(row)} == 1`));
m.constraint(x.map((_, j) => expr`${sum(x.map((row) => row[j]))} == 1`));

const assignment = x.map((row) =>
  row.findIndex((cell) => Math.round(cell.value!) === 1)
);
```

**PuLP (Python)**

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
