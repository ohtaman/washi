# #098. Logic-Based Benders (MIP + Pumpkin CP)

<!-- section:scenario -->
Each job in a manufacturing shop must be assigned to exactly one unrelated parallel machine, incurring a machine-dependent processing cost. Once assigned, each machine must schedule all of its assigned jobs non-overlappingly within a common planning horizon while respecting every job release time, processing duration, and deadline.

Implement Logic-Based Benders Decomposition across WaSHI solvers: minimize total assignment cost in a HiGHS binary MIP master problem without time-indexed or big-M disjunctive variables, verify each machine schedule using a Pumpkin constraint programming subproblem with the disjoint global constraint, and return no-good conflict cuts whenever a machine subset fails feasibility.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `costs` | `number[][]` | Assignment cost `costs[j][m]` for placing job $j$ on machine $m$ |
| `durations` | `number[]` | Integer processing duration of job $j$ |
| `releaseTimes` | `number[]` | Earliest integer start time allowed for job $j$ |
| `deadlines` | `number[]` | Latest integer completion time allowed for job $j$ |
| `horizon` | `number` | Global schedule completion limit across all machines |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `assignments` | `number[]` | Assigned machine index $m \in \{0, \dots, M-1\}$ for each job $j$ |
| `starts` | `number[]` | Integer start time $s_j$ yielding a valid non-overlapping schedule |
| `totalCost` | `number` | Minimum total assignment cost $\sum_j \text{costs}[j][\text{assignments}[j]]$ |

<!-- section:example -->
**Input**

```json
{
  "costs": [
    [10, 25],
    [12, 26],
    [30, 15],
    [28, 14]
  ],
  "durations": [4, 4, 3, 3],
  "releaseTimes": [0, 1, 2, 5],
  "deadlines": [6, 7, 10, 10],
  "horizon": 10
}
```

**Output**

```json
{
  "assignments": [1, 0, 1, 1],
  "starts": [0, 2, 4, 7],
  "totalCost": 66
}
```

Jobs `0` and `1` both prefer machine `0` cheaply (`10 + 12`), yet placing both on machine `0` violates their tight time windows `[0, 6]` and `[1, 7]`. Shifting job `0` to machine `1` gives intervals `[2, 6]` on machine `0` and `[0, 4], [4, 7], [7, 10]` on machine `1` for cost **66**.
