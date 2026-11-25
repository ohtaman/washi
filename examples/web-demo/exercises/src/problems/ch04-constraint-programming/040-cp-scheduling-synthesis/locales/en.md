# #040. Integrated Factory Cell Scheduling (CP Synthesis)

<!-- section:scenario -->
A manufacturing cell scheduler is planning a schedule for multiple machining jobs. Each job has a fixed assigned machine, processing duration (in minutes), and operating power (in kW), and you must decide both its machining start time (in minutes) and its operating mode. Each operating mode trades off off-machine pre-staging setup time (in minutes, starting from time 0) against off-machine post-processing cooldown time (in minutes); neither pre-staging nor post-processing occupies a machine or consumes factory power.

The schedule must satisfy all of the following conditions:
- **Pre-staging setup**: Every job can start machining only after its off-machine pre-staging setup completes (starting from time 0).
- **Machine non-overlap**: Active machining intervals of jobs assigned to the same machine cannot overlap in time.
- **Power cap**: Total simultaneous power across actively machining jobs cannot exceed the factory limit (in kW).
- **Precedence**: Preceding jobs must finish both machining and post-processing before dependent jobs can start machining.
- **Allowed mode pairs**: Specified job pairs must use one of their allowed mode combinations.

Minimize the overall maximum completion time including post-processing cooldown (makespan, in minutes).

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `powerCap` | `number` | Maximum simultaneous power consumption across the factory (kW) |
| `jobs` | `JobSpec[]` | Job specifications (`duration`, `power`, `machine`, `setupTimes`, `postTimes`) |
| `precedences` | `number[][]` | List of 0-based precedence pairs `[u, v]` where job `u` precedes job `v` |
| `modeRules` | `ModeRule[]` | Allowed mode pair tables `{ jobs: [u, v], allowedPairs }` |

Type definitions:
- `JobSpec`: `{ duration: number, power: number, machine: number, setupTimes: number[], postTimes: number[] }` (times in minutes, `power` in kW, `machine` 0-based; `setupTimes[m]` and `postTimes[m]` give pre-staging setup and post-processing cooldown for mode `m`).
- `ModeRule`: `{ jobs: [number, number], allowedPairs: [number, number][] }`, where `jobs` is a pair `[u, v]` of 0-based job indices and `allowedPairs` lists permitted `[modes[u], modes[v]]` pairs.

### Output

| Field | Type | Description |
| --- | --- | --- |
| `starts` | `number[]` | Integer start time for each job (minutes) |
| `modes` | `number[]` | Selected 0-based operating mode index for each job |
| `makespan` | `number` | Minimized maximum completion time (makespan) across all jobs, including post-processing cooldown (minutes) |

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

Job 1 (mode 0) machines on Machine 0 during [0, 4) and finishes off-machine post-processing at $4 + 2 = 6$ minutes; immediately after Job 1 frees Machine 0 at minute 4, Job 0 (mode 1, pre-staging $2 \le 4$) machines on [4, 8) and finishes at 8 minutes alongside Job 2 (mode 0, power $1 + 3 = 4 \le 4$ kW) machining on Machine 1 during [4, 8) and finishing post-processing at $8 + 3 = 11$ minutes, while Job 3 (mode 1, after both Job 0 at 8 and Job 1 at 6) machines on [9, 11) and finishes at 11 minutes, giving a makespan of $\max(8, 6, 11, 11) =$ **11** minutes.

<!-- section:hint1 -->
Introduce two integer decision variables per job: its start time `starts[i]` and its operating mode `modes[i]`. Couple them through mode-indexed setup/post-processing delays, precedences, per-machine non-overlap, global power capacity, and mode-compatibility tables to minimize makespan.

<!-- section:hint2 -->
Use `at(j.setupTimes, modes[i])` for start lower bounds and `at(j.postTimes, modes[i])` inside precedence and makespan expressions. Enforce `disjoint(...)` per machine over `{ start: starts[i], duration: j.duration }`, `cumulative(..., input.powerCap)` with `demand: j.power`, and `allowed([modes[u], modes[v]], rule.allowedPairs)` for each mode rule, then solve with `solver: "pumpkin"`.
