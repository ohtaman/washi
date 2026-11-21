# #074. Resource-Constrained Project Scheduling (RCPSP)

<!-- section:scenario -->
A project consists of non-preemptive tasks connected by directed acyclic precedence edges. Each task requires an integer duration and draws fixed integer amounts of one or two shared renewable resource pools while active.

At every moment, total demand for each resource cannot exceed its capacity. Assign integer start times to all tasks to minimize the project makespan.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `durations` | `number[]` | Integer duration $d_i$ of each task $i$ |
| `demands` | `number[][]` | Renewable resource demand $q_{r,i}$ of task $i$ on resource $r$ |
| `capacities` | `number[]` | Available capacity $C_r$ of each renewable resource $r$ |
| `precedences` | `number[][]` | Precedence pairs `[u, v]` requiring $S_u + d_u \le S_v$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `starts` | `number[]` | Integer start time $S_i \ge 0$ of each task |
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

Tasks run as `T0: [0,3)`, `T2: [3,7)`, `T3: [5,7)` (sharing peak load $2 + 1 = 3 \le 3$), `T1: [7,10)`, and `T4: [10,12)`, satisfying all precedence edges and giving makespan **12**.

<!-- section:hint1 -->
Model the project in Constraint Programming (`{ solver: "pumpkin" }`) with an integer start-time variable for each task. Combine directed acyclic precedence constraints for every dependency pair with one cumulative resource constraint per renewable resource pool.

<!-- section:hint2 -->
Bound each `m.integer(...)` start time between `0` and `horizon - d` where `horizon` is the sum of all task durations. For each resource $r$, collect `{ start, duration, demand }` entries for tasks with positive demand and enforce `cumulative(tasks, cap)`, then minimize `max(...)` over all task completion times without discretizing time into binary buckets.
