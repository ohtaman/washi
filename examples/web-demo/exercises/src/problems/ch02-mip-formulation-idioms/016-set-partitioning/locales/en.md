# #016. Minimum-Cost Set Partitioning

<!-- section:scenario -->
A dispatch planner must assign every scheduled delivery task to candidate vehicle routes, each with an operating cost and a fixed set of tasks it performs. Operating rules strictly forbid leaving any task unassigned or assigning the same task to more than one chosen route.

Select a subset of routes so that every task is covered **exactly once** while **minimizing total operating cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `numTasks` | `number` | Number of tasks indexed 0 through `numTasks - 1` |
| `costs` | `number[]` | Operating cost of each candidate route |
| `routes` | `number[][]` | Tasks included in each candidate route |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selected` | `number[]` | Binary (0 or 1) choices for each candidate route |
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
Each candidate route gets a binary selection variable. Write one constraint per task across all routes that include it so that no task is skipped or assigned more than once, while minimizing total operating cost.

<!-- section:hint2 -->
For each task $i \in \{0, \dots, \text{numTasks} - 1\}$, sum the binary variables `selected[j]` over all routes $j$ that include $i$ and constrain that sum with an equality $= 1$. Using an inequality $\ge 1$ instead would allow overlapping routes to appear cheaper, violating the single-assignment rule.
