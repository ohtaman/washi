# #036. Cumulative Resource Scheduling (RCPSP)

<!-- section:scenario -->
A construction project scheduler is scheduling multiple non-preemptive tasks under a shared renewable resource with a limited capacity (such as crew members or power supply equipment). Each task has a processing duration (in hours) and a constant resource demand (in units) consumed throughout its execution.

Determine non-negative integer start times so that for every pair with a precedence constraint, the predecessor finishes before the successor starts, and at any point in time the total resource consumption of concurrently running tasks does not exceed the capacity limit, minimizing the overall completion time (makespan, in hours).

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `capacity` | `number` | Capacity limit of the shared renewable resource (integer) |
| `durations` | `number[]` | Processing duration of each task (integer, hours) |
| `demands` | `number[]` | Resource consumption of each task while active (integer) |
| `precedences` | `number[][]` | 0-based precedence pairs `[u, v]` (task `u` must finish before task `v` starts) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `starts` | `number[]` | Non-negative integer start time for each task (hours) |
| `makespan` | `number` | Minimized maximum completion time / makespan (hours) |

<!-- section:example -->
**Input**

```json
{
  "capacity": 3,
  "durations": [4, 3, 3, 2],
  "demands": [2, 2, 1, 2],
  "precedences": [
    [0, 3],
    [1, 3]
  ]
}
```

**Output**

```json
{
  "starts": [0, 4, 0, 7],
  "makespan": 9
}
```

During [0, 3), Tasks 0 and 2 run concurrently consuming $2 + 1 = 3 \le 3$ units; after Task 0 finishes, Task 1 runs on [4, 7); and after both predecessors 0 and 1 complete, Task 3 runs on [7, 9). The maximum completion time (makespan) is $\max(0 + 4, 4 + 3, 0 + 3, 7 + 2) = \max(4, 7, 3, 9) =$ **9** hours.

<!-- section:hint1 -->
Introduce one integer start-time variable per task in `[0, horizon - durations[i]]`. Combine precedence constraints between dependent tasks with a single cumulative resource global constraint across all tasks, minimizing total makespan.

<!-- section:hint2 -->
Pass `{ start: starts[i], duration: input.durations[i], demand: input.demands[i] }` for every task into `cumulative(tasks, input.capacity)`. Minimize ``max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`))`` using `solver: "pumpkin"`.
