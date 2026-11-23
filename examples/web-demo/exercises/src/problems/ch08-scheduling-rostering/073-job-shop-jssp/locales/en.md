# #073. Job-Shop Scheduling (JSSP) via CP Disjoint

<!-- section:scenario -->
A precision machining shop has several machine tools (such as lathes, milling machines, and grinders) and multiple part-machining jobs. Each job must pass through a specified ordered sequence of operations, where each operation requires a designated machine for a fixed integer duration without preemption.

Each machine can process at most one operation at a time. Determine integer start times for all operations so as to minimize the overall makespan, the time when the last operation completes.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `machines` | `number[][]` | Machine index assigned to operation $o$ of job $j$ |
| `durations` | `number[][]` | Integer duration $d_{j,o}$ of operation $o$ of job $j$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `starts` | `number[][]` | Integer start time $S_{j,o} \ge 0$ of each operation |
| `makespan` | `number` | Minimized overall completion time $\max_{j,o} (S_{j,o} + d_{j,o})$ |

<!-- section:example -->
**Input**

```json
{
  "machines": [
    [0, 1, 2],
    [0, 2, 1],
    [1, 2, 0]
  ],
  "durations": [
    [3, 2, 2],
    [2, 1, 4],
    [4, 3, 2]
  ]
}
```

**Output**

```json
{
  "starts": [
    [2, 5, 7],
    [0, 2, 7],
    [0, 4, 7]
  ],
  "makespan": 11
}
```

Every job executes its operations in strict order (J0: [2,5)->[5,7)->[7,9), J1: [0,2)->[2,3)->[7,11), J2: [0,4)->[4,7)->[7,9)), no machine processes two operations simultaneously, and the final operation completion times are $7 + 2 = 9$, $7 + 4 = 11$, and $7 + 2 = 9$, giving makespan $\max(9, 11, 9) =$ **11**.

<!-- section:hint1 -->
Model the problem in Constraint Programming (`{ solver: "pumpkin" }`) using an integer start-time variable for each operation of each job. The model combines intra-job precedence between consecutive operations with one non-overlap global constraint per machine.

<!-- section:hint2 -->
Bound each `m.integer(...)` start time between 0 and `horizon - d` (where `horizon` is the sum of all operation durations), group operations by machine index, and pass each machine's `{ start, duration }` list to `disjoint(...)` (skipping machines with fewer than two operations). Minimize `max(...)` over all operation completion times and round integer outputs with `Math.round(...)`.
