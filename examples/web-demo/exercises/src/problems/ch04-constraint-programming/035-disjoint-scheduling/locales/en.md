# #035. Disjunctive Machine Scheduling (disjoint)

<!-- section:scenario -->
A production planner at a semiconductor fab is scheduling multiple wafer processing steps (such as cleaning, lithography, and etching) to run non-preemptively on their assigned equipment. Each step has a given processing duration (in minutes), earliest release time (in minutes), and assigned tool index.

Steps sharing the same tool cannot overlap in time, and for any pair of steps with a precedence constraint, the predecessor step must finish completely before the successor step can begin. Find the start time for each step that minimizes the overall completion time (makespan, in minutes).

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `durations` | `number[]` | Processing duration of each step (integer, minutes) |
| `releaseTimes` | `number[]` | Earliest allowed start time for each step (minutes) |
| `machines` | `number[]` | Assigned tool index (`0` to `M - 1`) for each step |
| `precedences` | `number[][]` | Precedence pairs `[u, v]` requiring `starts[u] + durations[u] <= starts[v]` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `starts` | `number[]` | Start time of each step (integer, minutes) |
| `makespan` | `number` | Minimized total completion time `max(starts[i] + durations[i])` (minutes) |

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

On Tool 0, Step 0 runs [0, 4), Step 3 runs [4, 6), Step 1 runs [6, 9), and Step 2 runs [9, 14) without overlap while honoring release times and precedence 0 -> 3. The total completion time is $\max(0 + 4, 6 + 3, 9 + 5, 4 + 2) = \max(4, 9, 14, 6) =$ **14** minutes.

<!-- section:hint1 -->
Introduce one integer start-time variable per task bounded below by its release time and above by `horizon - durations[i]`. Group tasks by their assigned machine and apply a disjunctive non-overlap constraint to each machine group alongside precedence constraints.

<!-- section:hint2 -->
For each machine, collect `{ start: starts[i], duration: input.durations[i] }` for tasks on that machine and enforce `disjoint(tasks)` (when the group is non-empty). Minimize `max(starts.map((s, i) => expr\`${s} + ${input.durations[i]}\`))` using `solver: "pumpkin"`.
