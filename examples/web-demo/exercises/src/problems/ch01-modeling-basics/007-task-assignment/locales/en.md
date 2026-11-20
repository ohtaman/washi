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

Assigning tasks `[1, 0, 2]` gives each worker a distinct task with total cost $2 + 6 + 1 =$ **9**.
