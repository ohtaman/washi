# #007. Worker-Task 1-to-1 Assignment

<!-- section:scenario -->
There are equally many workers and tasks, and assigning each worker to any task incurs a specific assignment cost.

Find a **1-to-1 assignment** where every worker receives **exactly one** task and every task is covered by **exactly one** worker, **minimizing total assignment cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `costs` | `number[][]` | Square $n \times n$ matrix where `costs[i][j]` is the cost of worker $i$ doing task $j$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `assignment` | `number[]` | Array of length $n$ where `assignment[i]` is the task assigned to worker $i$ |
| `totalCost` | `number` | Minimized total assignment cost |

<!-- section:example -->
**Input**

```json
{
  "costs": [
    [9, 2, 7],
    [6, 4, 3],
    [5, 8, 1]
  ]
}
```

**Output**

```json
{
  "assignment": [1, 0, 2],
  "totalCost": 9
}
```

Row-by-row greedy selection picks costs 2, 3, and 5 for a total of 10. Optimal global matching assigns `[1, 0, 2]` at cost $2 + 6 + 1 =$ **9**.

<!-- section:hint1 -->
The 2D binary matrix `x[i][j]` (`n` rows by `n` columns) is declared in the starter code:
- **Row constraints** (each worker $i$ gets 1 task): `sum(x[i]) == 1`
- **Column constraints** (each task $j$ gets 1 worker): `sum(x.map((row) => row[j])) == 1`

<!-- section:hint2 -->
To build `assignment[i]` after `m.solve()` (`h.minimize(...)`), scan row `i` and pick the column index `j` where `Math.round(x[i][j].value!) === 1` (`round(h.val(x[i][j])) == 1` in Python).

<!-- section:formulation -->
$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \sum_{j=0}^{n-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} x_{i,j} = 1 && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} x_{i,j} = 1 && \forall j \in \{0, \dots, n-1\} \\
& x_{i,j} \in \{0, 1\} && \forall i, j
\end{aligned}
$$
