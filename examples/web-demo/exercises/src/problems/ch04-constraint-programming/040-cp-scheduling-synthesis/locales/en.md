# #040. Integrated Factory Cell Scheduling (CP Synthesis)

<!-- section:scenario -->
A manufacturing cell scheduler is planning a schedule for multiple machining jobs. Each job has a fixed assigned machine, processing duration (in minutes), and operating power (in kW), and you must decide both its start time (in minutes) and its operating mode. Each operating mode trades off off-machine pre-staging setup time (in minutes) against post-processing cooldown time (in minutes).

Every job can only start after its pre-staging setup completes, and the schedule must simultaneously satisfy non-overlap on each machine, the factory's total power limit (in kW), precedence constraints waiting for post-processing completion, and mode compatibility tables for specified job pairs. Minimize the overall completion time (makespan, in minutes).

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `powerCap` | `number` | Maximum simultaneous power consumption across the factory (kW) |
| `jobs` | `JobSpec[]` | Job specifications (`duration`, `power`, `machine`, `setupTimes`, `postTimes`) |
| `precedences` | `number[][]` | Precedence pairs `[u, v]` requiring `starts[u] + duration[u] + postTimes[u][modes[u]] <= starts[v]` |
| `modeRules` | `ModeRule[]` | Allowed mode pair tables `{ jobs: [u, v], allowedPairs }` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `starts` | `number[]` | Integer start time for each job (minutes) |
| `modes` | `number[]` | Selected operating mode index for each job |
| `makespan` | `number` | Minimized total completion time `max(starts[i] + duration[i] + postTimes[i][modes[i]])` (minutes) |

<!-- section:example -->
**Input**

```json
{
  "powerCap": 4,
  "jobs": [
    { "duration": 4, "power": 1, "machine": 0, "setupTimes": [0, 2], "postTimes": [2, 0] },
    { "duration": 4, "power": 2, "machine": 0, "setupTimes": [0, 2], "postTimes": [2, 0] },
    { "duration": 4, "power": 3, "machine": 1, "setupTimes": [0, 3], "postTimes": [3, 0] },
    { "duration": 2, "power": 2, "machine": 1, "setupTimes": [0, 2], "postTimes": [1, 0] }
  ],
  "precedences": [[0, 3], [1, 3]],
  "modeRules": [{ "jobs": [1, 2], "allowedPairs": [[0, 0], [1, 1]] }]
}
```

**Output**

```json
{
  "starts": [4, 0, 4, 9],
  "modes": [1, 0, 0, 1],
  "makespan": 11
}
```

After Job 1 (mode 0) finishes at [0, 4) + post-processing 2 = 6 minutes, Job 0 on Machine 0 (mode 1, pre-staging setup $2 \le 4$) runs on [4, 8), Job 2 (mode 0, power $1 + 3 = 4 \le 4$ kW) runs on [4, 8) + post-processing 3 = 11 minutes, and Job 3 (mode 1) runs on [9, 11), yielding a makespan of **11** minutes.

<!-- section:hint1 -->
Introduce two integer decision variables per job: its start time `starts[i]` and its operating mode `modes[i]`. Couple them through mode-indexed setup/post-processing delays, precedences, per-machine non-overlap, global power capacity, and mode-compatibility tables to minimize makespan.

<!-- section:hint2 -->
Use `at(j.setupTimes, modes[i])` for start lower bounds and `at(j.postTimes, modes[i])` inside precedence and makespan expressions. Enforce `disjoint(...)` per machine over `{ start: starts[i], duration: j.duration }`, `cumulative(..., input.powerCap)` with `demand: j.power`, and `allowed([modes[u], modes[v]], rule.allowedPairs)` for each mode rule, then solve with `solver: "pumpkin"`.
