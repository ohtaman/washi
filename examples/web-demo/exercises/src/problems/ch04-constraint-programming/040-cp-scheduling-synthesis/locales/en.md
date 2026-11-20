# #040. Integrated Factory Cell Scheduling (CP Synthesis)

<!-- section:scenario -->
A manufacturing cell processes n jobs, each assigned to a specific machine with fixed processing duration and active power draw. For every job i, you must choose both an integer start time starts[i] and an operating mode modes[i] that trades off off-machine pre-staging setup time against post-processing cooldown time.

Job i cannot start before its mode's setup time, jobs on the same machine cannot overlap, total power across concurrent jobs cannot exceed powerCap, precedence pairs [u, v] require job u's post-processing to finish before job v starts, and each rule in modeRules restricts paired job modes to approved tuples. Minimize overall completion time (makespan).

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `powerCap` | `number` | Shared factory power capacity across all concurrent jobs |
| `jobs` | `JobSpec[]` | Job specs (`duration`, `power`, `machine`, `setupTimes`, `postTimes`) |
| `precedences` | `number[][]` | Pairs `[u, v]` requiring `starts[u] + duration[u] + postTimes[u][modes[u]] <= starts[v]` |
| `modeRules` | `ModeRule[]` | Compatibility rules `{ jobs: [u, v], allowedPairs }` on `(modes[u], modes[v])` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `starts` | `number[]` | Integer start time for each job |
| `modes` | `number[]` | Chosen integer mode index for each job |
| `makespan` | `number` | Minimized max finish `max(starts[i] + duration[i] + postTimes[i][modes[i]])` |

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

Job 1 (mode `0`) runs `[0, 4)` + post `2` = `6`, freeing Machine 0 so Job 0 (mode `1`, setup `2 <= 4`, post `0`) runs `[4, 8)` alongside Job 2 (mode `0`, power $1 + 3 = 4 \le 4$) at `[4, 8)` + post `3` = `11`, while Job 3 (mode `1`) runs `[9, 11)`, giving makespan **11**.
