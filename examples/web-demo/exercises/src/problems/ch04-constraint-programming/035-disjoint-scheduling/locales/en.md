# #035. Disjunctive Machine Scheduling (disjoint)

<!-- section:scenario -->
A production planner at a semiconductor fab is scheduling multiple wafer processing steps (such as cleaning, lithography, and etching) to run non-preemptively on their assigned tools. Each step has a given processing duration (in minutes), earliest release time (in minutes), and assigned tool index.

Steps sharing the same tool cannot overlap in time, and for any pair of steps with a precedence constraint, the predecessor step must finish completely before the successor step can begin. Find the start time for each step that minimizes the maximum completion time (makespan, in minutes).

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `durations` | `number[]` | Processing duration of each step (integer, minutes) |
| `releaseTimes` | `number[]` | Earliest allowed start time for each step (minutes) |
| `machines` | `number[]` | Assigned 0-based tool index for each step |
| `precedences` | `number[][]` | Precedence pairs `[u, v]` indicating that step `u` must finish before step `v` starts |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `starts` | `number[]` | Start time of each step (integer, minutes) |
| `makespan` | `number` | Minimized maximum completion time `max(starts[i] + durations[i])` (minutes) |

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

On Tool 0, Step 0 runs [0, 4), Step 3 runs [4, 6), Step 1 runs [6, 9), and Step 2 runs [9, 14) without overlap while honoring release times and precedence 0 -> 3. The maximum completion time is $\max(0 + 4, 6 + 3, 9 + 5, 4 + 2) = \max(4, 9, 14, 6) =$ **14** minutes.

<!-- section:hint1 -->
Introduce one integer start-time variable per step bounded below by its release time and above by `horizon - durations[i]`. Group steps by their assigned tool and apply a disjunctive non-overlap constraint to each tool group alongside precedence constraints.

<!-- section:hint2 -->
For each tool, collect `{ start: starts[i], duration: input.durations[i] }` for the steps assigned to that tool and enforce `disjoint(tasks)`. Minimize the makespan via `minimize(max(...))` over each step's completion time `starts[i] + durations[i]` using `solver: "pumpkin"`.
