# #035. Disjunctive Machine Scheduling (disjoint)

<!-- section:scenario -->
A production planner at a semiconductor fab is scheduling multiple wafer processing tasks (such as cleaning, lithography, and etching) to run non-preemptively on their assigned machines. Each task has a given processing duration (in minutes), earliest release time (in minutes), and assigned machine index.

Tasks sharing the same machine cannot overlap in time, and for any pair of tasks with a precedence constraint, the predecessor task must finish completely before the successor task can begin. Find the start time for each task that minimizes the overall completion time (makespan, in minutes).

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `durations` | `number[]` | Processing duration of each task (integer, minutes) |
| `releaseTimes` | `number[]` | Earliest allowed start time (release time) for each task (non-negative integer, minutes) |
| `machines` | `number[]` | Assigned machine index (`0` to `M - 1`, where `M` is the number of machines) for each task |
| `precedences` | `number[][]` | 0-based precedence pairs `[u, v]` (task `u` must finish before task `v` starts) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `starts` | `number[]` | Start time of each task (integer, minutes) |
| `makespan` | `number` | Minimized maximum completion time / makespan (minutes) |

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

On Machine 0, Task 0 runs [0, 4), Task 3 runs [4, 6), Task 1 runs [6, 9), and Task 2 runs [9, 14) without overlap while honoring release times and precedence 0 -> 3. The maximum completion time (makespan) is $\max(0 + 4, 6 + 3, 9 + 5, 4 + 2) = \max(4, 9, 14, 6) =$ **14** minutes.

<!-- section:hint1 -->
Introduce one integer start-time variable per task bounded below by its release time and above by `horizon - durations[i]`. Group tasks by their assigned machine and apply a disjunctive non-overlap constraint to each machine group alongside precedence constraints.

<!-- section:hint2 -->
For each machine, collect `{ start: starts[i], duration: input.durations[i] }` for tasks on that machine and enforce `disjoint(tasks)` (when the group is non-empty). Minimize ``max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`))`` using `solver: "pumpkin"`.
