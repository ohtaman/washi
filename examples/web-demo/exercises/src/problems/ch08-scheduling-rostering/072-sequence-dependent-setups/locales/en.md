# #072. Single-Machine Scheduling with Sequence-Dependent Setups

<!-- section:scenario -->
A single machine processes a batch of jobs starting at time zero with no initial setup required before the first job. Whenever the machine switches from job $i$ to job $j$, it incurs a sequence-dependent changeover time before job $j$ can begin.

Choose a permutation of all jobs and their completion times to minimize the total tardiness across all jobs.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `processingTimes` | `number[]` | Processing duration $p_j$ for each job |
| `setupMatrix` | `number[][]` | Changeover time $s_{ij}$ incurred when job $j$ immediately follows job $i$ |
| `dueDates` | `number[]` | Target due date $d_j$ for each job |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `order` | `number[]` | Permutation of job indices `0..n-1` from first to last |
| `completions` | `number[]` | Completion time $C_j$ for each job $j$ |
| `totalTardiness` | `number` | Minimized total tardiness $\sum_j \max(0, C_j - d_j)$ |

<!-- section:example -->
**Input**

```json
{
  "processingTimes": [3, 4, 2],
  "setupMatrix": [
    [0, 5, 1],
    [2, 0, 4],
    [3, 1, 0]
  ],
  "dueDates": [6, 8, 5]
}
```

**Output**

```json
{
  "order": [0, 2, 1],
  "completions": [3, 11, 6],
  "totalTardiness": 4
}
```

Processing jobs in sequence $0 \to 2 \to 1$ gives $C_0 = 3$ ($T_0 = 0$), $C_2 = 3 + 1 + 2 = 6$ ($T_2 = 1$), and $C_1 = 6 + 1 + 4 = 11$ ($T_1 = 3$), for a total tardiness of $0 + 1 + 3 =$ **4**.
