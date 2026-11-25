# #074. Resource-Constrained Project Scheduling (RCPSP)

<!-- section:scenario -->
A civil construction project (such as excavation, foundation work, steel erection, piping, and interior finishing) consists of $n$ non-preemptive tasks connected by directed acyclic precedence edges: for every precedence pair, the predecessor must finish before its successor can start. Each task has a fixed integer duration and consumes fixed integer amounts from one or more shared renewable resource pools (such as cranes and specialized crews) while active.

At every moment, total demand for each resource cannot exceed its capacity. Assign a non-negative integer start time to every task so that all precedence and resource constraints hold and the project makespan is minimized.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `durations` | `number[]` | Integer duration $d_i$ of each task $i$ (length $n$) |
| `demands` | `number[][]` | Renewable resource demand $q_{r,i}$ (`demands[r][i]`, $R \times n$) of task $i$ on resource $r$ |
| `capacities` | `number[]` | Available capacity $C_r$ of each renewable resource $r$ (length $R$) |
| `precedences` | `number[][]` | 0-based task index pairs `[u, v]` where task `u` must finish before task `v` starts |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `starts` | `number[]` | Non-negative integer start time $S_i \ge 0$ of each task |
| `makespan` | `number` | Minimized project completion time $\max_i (S_i + d_i)$ |

<!-- section:example -->
**Input**

```json
{
  "durations": [3, 3, 4, 2, 2],
  "demands": [
    [2, 2, 2, 1, 2]
  ],
  "capacities": [3],
  "precedences": [[0, 1], [0, 3], [1, 4], [2, 4], [3, 4]]
}
```

**Output**

```json
{
  "starts": [0, 7, 3, 5, 10],
  "makespan": 12
}
```

Tasks run as T0: [0,3), T2: [3,7), T3: [5,7) (sharing peak load $2 + 1 = 3 \le 3$), T1: [7,10), and T4: [10,12), satisfying all precedence edges and giving completion times [3, 10, 7, 7, 12] for makespan $\max(3, 10, 7, 7, 12) =$ **12**.

<!-- section:hint1 -->
Model the project in Constraint Programming with an integer start-time variable for each task. Combine directed acyclic precedence constraints for every dependency pair with one cumulative resource constraint per renewable resource pool.

<!-- section:hint2 -->
Create the model with `{ solver: "pumpkin" }` and bound each `m.integer(...)` start time between 0 and `horizon - d`, where `horizon` is the sum of all task durations. For each resource $r$, collect `{ start, duration, demand }` entries for tasks with positive demand and enforce `cumulative(tasks, cap)`, then minimize `max(...)` over all task completion times without discretizing time into binary buckets.
