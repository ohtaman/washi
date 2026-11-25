# #085. Minimum-Disruption Rescheduling

<!-- section:scenario -->
A call center has already published a baseline 0-1 shift schedule across its workers and time slots. Just before operations begin, unexpected absences make certain worker-slot pairs unavailable.

Create a new 0-1 schedule that avoids all unavailable cells, meets the exact headcount required in each time slot, and does not exceed any worker's maximum shift limit. To minimize workplace disruption, minimize the weighted Hamming distance (number of changed cells from the baseline schedule) plus total worker assignment costs.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `baseline` | `number[][]` | Baseline 0-1 shift matrix (`[worker][time slot]`, $m \times T$) |
| `unavailable` | `number[][]` | Unavailability mask (`[worker][time slot]`, $m \times T$; 1 forbids assignment) |
| `demands` | `number[]` | Exact headcount required in each time slot |
| `maxShifts` | `number[]` | Maximum number of shifts allowed for each worker |
| `workerCosts` | `number[]` | Assignment cost per shift for each worker |
| `disruptionWeight` | `number` | Penalty weight per changed cell from `baseline` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `schedule` | `number[][]` | Repaired 0-1 shift matrix (`[worker][time slot]`, $m \times T$) |
| `hammingDistance` | `number` | Total number of cells differing from `baseline` |
| `totalObjective` | `number` | Minimized weighted Hamming distance plus worker assignment costs |

<!-- section:example -->
**Input**

```json
{
  "baseline": [
    [1, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 1, 1]
  ],
  "unavailable": [
    [1, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  "demands": [1, 2, 2, 1],
  "maxShifts": [2, 2, 2],
  "workerCosts": [10, 14, 12],
  "disruptionWeight": 50
}
```

**Output**

```json
{
  "schedule": [
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [1, 0, 0, 1]
  ],
  "hammingDistance": 4,
  "totalObjective": 272
}
```

Worker 0 avoids unavailable slot 0 while Workers 0 and 2 swap slots 0 and 2 (`hammingDistance = 4`), satisfying demands `[1, 2, 2, 1]` and shift caps `[2, 2, 2]` for objective $50 \times 4 + 2(10 + 14 + 12) =$ **272**.


<!-- section:hint1 -->
Create a binary decision matrix indexed by worker and time slot representing the repaired schedule. Enforce hard constraints for outage exclusions, exact per-slot staffing demands, and per-worker shift limits, then minimize the weighted Hamming distance from the baseline schedule plus worker assignment costs.

<!-- section:hint2 -->
Because each `baseline[i][t]` is a known constant in $\{0, 1\}$, the Hamming flip indicator $|x_{i,t} - b_{i,t}|$ is already linear without extra auxiliary variables: it equals $x_{i,t}$ when $b_{i,t} = 0$ and $1 - x_{i,t}$ when $b_{i,t} = 1$. After solving, compute `hammingDistance` by counting changed cells (or evaluating the linear flip expression) and round binary values with `Math.round(v.value!)` in WaSHI or `round(pulp.value(v))` in PuLP.