# #036. Cumulative Resource Scheduling (RCPSP)

<!-- section:scenario -->
A project consists of n non-preemptive tasks sharing a renewable resource pool of capacity units (such as power kW or crew headcount). Each task i requires duration durations[i] and consumes demands[i] resource units throughout its active interval.

Every precedence pair [u, v] requires task u to finish before task v begins, and at every point in time the sum of demands of active tasks must not exceed capacity. Choose integer start times starts[i] >= 0 to minimize total makespan.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `capacity` | `number` | Shared renewable resource capacity |
| `durations` | `number[]` | Integer duration of each task |
| `demands` | `number[]` | Renewable resource units consumed per task while active |
| `precedences` | `number[][]` | Precedence pairs `[u, v]` requiring `starts[u] + durations[u] <= starts[v]` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `starts` | `number[]` | Non-negative integer start time for each task |
| `makespan` | `number` | Minimized maximum completion time `max(starts[i] + durations[i])` |

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

Tasks 0 and 2 run concurrently over `[0, 3)` using $2 + 1 = 3 \le 3$ units; Task 1 runs `[4, 7)` (demand 2) after Task 0 frees capacity, and Task 3 runs `[7, 9)` after both Tasks 0 and 1 finish, yielding makespan **9**.

<!-- section:hint1 -->
Introduce one integer start-time variable per task in `[0, horizon - durations[i]]`. Combine precedence constraints between dependent tasks with a single cumulative resource global constraint across all tasks, minimizing total makespan.

<!-- section:hint2 -->
Pass `{ start: starts[i], duration: input.durations[i], demand: input.demands[i] }` for every task into `cumulative(tasks, input.capacity)`. Minimize `max(starts.map((s, i) => expr\`${s} + ${input.durations[i]}\`))` using `solver: "pumpkin"`.
