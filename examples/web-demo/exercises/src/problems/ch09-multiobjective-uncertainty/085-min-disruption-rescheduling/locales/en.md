# #085. Minimum-Disruption Rescheduling

<!-- section:scenario -->
An operations center starts with a published binary shift assignment matrix across several workers and time slots. Before shifts begin, unexpected outages mark certain worker-slot pairs as unavailable.

Find a valid binary replacement schedule where no unavailable worker-slot pair is assigned, every slot meets its exact required headcount, and no worker exceeds their maximum shift count. To avoid unnecessary schedule churn, **minimize the disruption penalty times Hamming distance from the baseline schedule plus total worker shift costs**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `baseline` | `number[][]` | Baseline binary (`0`/`1`) schedule matrix ($m \times T$) |
| `unavailable` | `number[][]` | Binary outage mask (`1` forbids assigning worker $i$ to slot $t$) |
| `demands` | `number[]` | Exact worker headcount required in each slot $t$ |
| `maxShifts` | `number[]` | Maximum total shifts allowed for each worker $i$ |
| `workerCosts` | `number[]` | Assignment cost per shift for each worker $i$ |
| `disruptionWeight` | `number` | Penalty weight per changed cell from `baseline` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `schedule` | `number[][]` | Repaired binary (`0`/`1`) schedule matrix ($m \times T$) |
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
