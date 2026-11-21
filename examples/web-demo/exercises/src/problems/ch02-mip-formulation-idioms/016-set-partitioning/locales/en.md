# #016. Minimum-Cost Set Partitioning

<!-- section:scenario -->
A dispatch planner must assign every scheduled delivery task to candidate vehicle routes, each with an operating cost and a fixed set of tasks it performs. Unlike flexible covering problems, regulatory rules strictly forbid either leaving a task unassigned or assigning the same task to two chosen routes.

Select a disjoint subset of routes so that every task is covered **exactly once** while **minimizing total operating cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `numTasks` | `number` | Number of tasks indexed `0` through `numTasks - 1` |
| `costs` | `number[]` | Operating cost of each candidate route |
| `routes` | `number[][]` | Tasks included in each candidate route $j$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selected` | `number[]` | Binary (`0` or `1`) choices for each candidate route |
| `totalCost` | `number` | Minimized total operating cost |

<!-- section:example -->
**Input**

```json
{
  "numTasks": 5,
  "costs": [5, 5, 6, 9, 8, 10],
  "routes": [
    [0, 1, 2],
    [2, 3, 4],
    [0, 1],
    [2, 3, 4],
    [1, 2, 3],
    [0, 4]
  ]
}
```

**Output**

```json
{
  "selected": [0, 1, 1, 0, 0, 0],
  "totalCost": 11
}
```

Selecting routes 1 (`[2, 3, 4]`) and 2 (`[0, 1]`) partitions tasks `{0, 1, 2, 3, 4}` with zero overlap or gap for total cost $5 + 6 =$ **11**.

<!-- section:hint1 -->
Each candidate route gets a binary selection variable. Like set covering, you write one constraint per task across all routes that include it, but here no task may be skipped or double-counted.

<!-- section:hint2 -->
Replace the set-covering $\ge 1$ inequality with an equality $= 1$ for every task $i \in \{0, \dots, \text{numTasks} - 1\}$ over the routes covering $i$. A covering relaxation ($\ge 1$) can appear cheaper by overlapping routes, which violates exact partitioning.
