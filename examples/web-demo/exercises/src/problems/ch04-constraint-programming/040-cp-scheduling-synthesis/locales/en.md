# #040. Integrated Factory Cell Scheduling (CP Synthesis)

<!-- section:scenario -->
A manufacturing cell scheduler is planning a schedule for multiple machining jobs. Each job has a fixed assigned machine, processing duration (in minutes), and operating power (in kW), and you must decide both its integer machining start time (in minutes) and its operating mode. Each operating mode trades off off-machine pre-staging setup time (in minutes) against off-machine post-processing cooldown time (in minutes).

The schedule must satisfy all of the following conditions:
- **Pre-staging setup**: Off-machine pre-staging starts at time 0 in parallel for every job (without waiting for predecessors), and each job can begin active machining only after its pre-staging setup completes.
- **Machine non-overlap**: Active machining intervals on the same machine cannot overlap (consecutive jobs may touch at endpoints); off-machine pre-staging and post-processing do not occupy the machine.
- **Power cap**: Total simultaneous power across jobs in active machining cannot exceed the factory limit (in kW); off-machine pre-staging and post-processing draw no power.
- **Precedence**: Preceding jobs must finish both active machining and off-machine post-processing before dependent jobs can start active machining.
- **Allowed mode pairs**: Specified job pairs must use one of their allowed mode combinations.

Minimize the overall completion time (makespan, in minutes), including off-machine post-processing.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `powerCap` | `number` | Maximum simultaneous power consumption across the factory (kW) |
| `jobs` | `JobSpec[]` | Job specifications (`duration`, `power`, `machine`, `setupTimes`, `postTimes`) |
| `precedences` | `number[][]` | Precedence pairs `[u, v]` (0-based) requiring `starts[u] + jobs[u].duration + jobs[u].postTimes[modes[u]] <= starts[v]` |
| `modeRules` | `ModeRule[]` | Allowed mode pair tables `{ jobs: [u, v], allowedPairs }` |

Type definitions:
- `JobSpec`: `{ duration: number, power: number, machine: number, setupTimes: number[], postTimes: number[] }` (times in minutes, `power` in kW, `machine` 0-based; `setupTimes[m]` and `postTimes[m]` give off-machine pre-staging setup and post-processing cooldown for mode `m`, requiring `starts[i] >= jobs[i].setupTimes[modes[i]]`).
- `ModeRule`: `{ jobs: [number, number], allowedPairs: number[][] }`, where `jobs` is a pair `[u, v]` of 0-based job indices and each entry of `allowedPairs` is a permitted `[modeA, modeB]` pair for `[modes[u], modes[v]]`.

### Output

| Field | Type | Description |
| --- | --- | --- |
| `starts` | `number[]` | Integer start time for each job (minutes) |
| `modes` | `number[]` | Selected 0-based integer operating mode index in `0 .. jobs[i].setupTimes.length - 1` for each job |
| `makespan` | `number` | Minimized maximum completion time `max(starts[i] + jobs[i].duration + jobs[i].postTimes[modes[i]])` (minutes) |

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

Job 1 (mode 0) machines on Machine 0 during [0, 4) (releasing Machine 0 at t = 4) and completes off-machine post-processing on [4, 6) at t = 6; Job 0 (mode 1, pre-staging setup $2 \le 4$) then machines on Machine 0 during [4, 8) while Job 2 (mode 0, allowed pair (0, 0), concurrent power $1 + 3 = 4 \le 4$ kW) machines on Machine 1 during [4, 8) with off-machine post-processing on [8, 11), and Job 3 (mode 1, after predecessors finish at t = 8 and t = 6) machines on Machine 1 during [9, 11), yielding a makespan of **11** minutes.

<!-- section:hint1 -->
Introduce two integer decision variables per job: its start time `starts[i]` and its operating mode `modes[i]`. Couple them through mode-indexed setup/post-processing delays, precedences, per-machine non-overlap, global power capacity, and mode-compatibility tables to minimize makespan.

<!-- section:hint2 -->
Use `at(j.setupTimes, modes[i])` for start lower bounds and `at(j.postTimes, modes[i])` inside precedence and makespan expressions. Enforce `disjoint(...)` per machine over `{ start: starts[i], duration: j.duration }`, `cumulative(..., input.powerCap)` with `demand: j.power`, and `allowed([modes[u], modes[v]], rule.allowedPairs)` for each mode rule, then solve with `solver: "pumpkin"`.
