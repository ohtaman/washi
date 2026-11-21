# #071. Single-Machine Weighted Tardiness with Release Dates

<!-- section:scenario -->
A single non-preemptive machine must process several jobs. Each job has a release date before which it cannot start, a processing time, a due date, and a tardiness weight.

Two jobs cannot overlap on the machine at any time. Choose the start time of every job so as to minimize the total weighted tardiness across all jobs.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `releaseDates` | `number[]` | Earliest allowed start time $r_j$ for each job |
| `processingTimes` | `number[]` | Non-preemptive duration $p_j$ for each job |
| `dueDates` | `number[]` | Target completion deadline $d_j$ for each job |
| `weights` | `number[]` | Tardiness penalty weight $w_j$ per unit late for each job |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `starts` | `number[]` | Start time $S_j$ for each job ($S_j \ge r_j$) |
| `totalWeightedTardiness` | `number` | Minimized sum $\sum_j w_j \max(0, S_j + p_j - d_j)$ |

<!-- section:example -->
**Input**

```json
{
  "releaseDates": [0, 2, 1],
  "processingTimes": [4, 3, 2],
  "dueDates": [5, 5, 6],
  "weights": [1, 5, 2]
}
```

**Output**

```json
{
  "starts": [7, 2, 5],
  "totalWeightedTardiness": 8
}
```

Running job 1 on $[2, 5)$, job 2 on $[5, 7)$, and job 0 on $[7, 11)$ respects all release dates without overlap and gives tardiness $[6, 0, 1]$, yielding total weighted tardiness $1 \times 6 + 5 \times 0 + 2 \times 1 =$ **8**.

<!-- section:hint1 -->
Use continuous start-time variables bounded below by each job's release date, alongside non-negative continuous tardiness variables per job. Because release dates and processing times may be fractional, model non-overlap between every pair of distinct jobs using pairwise binary precedence choices rather than time-indexed buckets.

<!-- section:hint2 -->
For each pair $(i, j)$ with $i < j$, a binary variable decides whether $i$ precedes $j$ or $j$ precedes $i$ via two Big-M disjunctive constraints. Derive a tight valid Big-M from the instance horizon $H = \max_k r_k + \sum_k p_k$, and bound each start time above by $H - p_j$ so $M = H$ safely deactivates the inactive branch without weakening the relaxation unnecessarily.
