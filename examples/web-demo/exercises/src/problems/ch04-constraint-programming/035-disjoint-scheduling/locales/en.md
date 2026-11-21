# #035. Disjunctive Machine Scheduling (disjoint)

<!-- section:scenario -->
A workshop has n tasks to execute non-preemptively on unary machines. Each task i has a fixed integer duration durations[i], an earliest release time releaseTimes[i], and an assigned machine machines[i].

Tasks sharing the same machine cannot overlap in time, and each precedence pair [u, v] requires task u to complete before task v starts. Choose integer start times starts[i] to minimize total completion time (makespan).

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `durations` | `number[]` | Integer processing duration of each task |
| `releaseTimes` | `number[]` | Earliest allowed integer start time for each task |
| `machines` | `number[]` | Machine index (`0..M-1`) assigned to each task |
| `precedences` | `number[][]` | Precedence pairs `[u, v]` requiring `starts[u] + durations[u] <= starts[v]` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `starts` | `number[]` | Integer start time of each task |
| `makespan` | `number` | Minimized maximum completion time `max(starts[i] + durations[i])` |

<!-- section:example -->
**Input**

```json
{
  "durations": [4, 3, 5, 2],
  "releaseTimes": [0, 2, 0, 4],
  "machines": [0, 0, 0, 0],
  "precedences": [
    [0, 3]
  ]
}
```

**Output**

```json
{
  "starts": [0, 6, 9, 4],
  "makespan": 14
}
```

Task 0 runs `[0, 4)`, Task 3 runs `[4, 6)`, Task 1 runs `[6, 9)`, and Task 2 runs `[9, 14)` without overlap on Machine 0 while honoring release times and `0 -> 3`, giving makespan **14**.

<!-- section:hint1 -->
Introduce one integer start-time variable per task bounded below by its release time and above by `horizon - durations[i]`. Group tasks by their assigned machine and apply a disjunctive non-overlap constraint to each machine group alongside precedence constraints.

<!-- section:hint2 -->
For each machine, collect `{ start: starts[i], duration: input.durations[i] }` for tasks on that machine and enforce `disjoint(tasks)` (when the group is non-empty). Minimize `max(starts.map((s, i) => expr\`${s} + ${input.durations[i]}\`))` using `solver: "pumpkin"`.
