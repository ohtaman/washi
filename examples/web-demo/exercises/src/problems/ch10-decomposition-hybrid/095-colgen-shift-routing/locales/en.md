# #095. Shift Rostering via Column Generation

<!-- section:scenario -->
An operations manager schedules identical workers across a multi-day planning horizon. Each day requires at least a target number of staff on duty. Every assigned worker incurs a fixed base onboarding cost plus a daily wage for each day worked, must work between one day and a maximum total work-day cap, and cannot exceed a maximum consecutive work-day streak.

Use WaSHI column generation to price out legal multi-day shift patterns from a Restricted Master Problem and finalize an integer schedule that minimizes total staffing cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Minimum required staff count on each day $d$ |
| `shiftCosts` | `number[]` | Daily variable wage incurred per worker working on day $d$ |
| `baseCost` | `number` | Fixed base cost per worker roster column used |
| `maxConsecutive` | `number` | Maximum consecutive active work days allowed in any shift pattern |
| `maxWorkDays` | `number` | Maximum total work days allowed in any shift pattern |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selectedColumns` | `number[][]` | Binary shift vectors ($0$ or $1$ per day) selected in the schedule |
| `counts` | `number[]` | Non-negative integer headcount assigned to each selected shift pattern |
| `totalCost` | `number` | Total roster cost $\sum_p \text{counts}[p] \cdot (\text{baseCost} + \sum_d \text{shiftCosts}[d] \cdot a_{pd})$ |

<!-- section:example -->
**Input**

```json
{
  "demands": [2, 3, 4, 3, 2],
  "shiftCosts": [12, 10, 11, 10, 13],
  "baseCost": 25,
  "maxConsecutive": 3,
  "maxWorkDays": 4
}
```

**Output**

```json
{
  "selectedColumns": [
    [1, 0, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [1, 1, 1, 0, 1]
  ],
  "counts": [1, 2, 1],
  "totalCost": 254
}
```

Each pattern works at most `4` days with at most `3` consecutive days, covers daily demands `[2, 3, 4, 3, 2]`, and costs `1 * 71 + 2 * 56 + 1 * 71 =` **254**.

<!-- section:hint1 -->
Decompose into a Restricted Master Problem (selecting headcounts for generated shift patterns to cover daily demands) and a binary MIP pricing subproblem (generating a single legal multi-day shift pattern). Seed the master with single-day starter columns for days with positive demand so the initial LP is always feasible.

<!-- section:hint2 -->
Call `solveColumnGeneration({ master, finalizeAsMIP: true, pricing })` with `demand_${d}` constraints. In `pricing({ getDual })`, model a binary vector $a_d \in \{0,1\}$ enforcing $1 \le \sum_d a_d \le \text{maxWorkDays}$ and sliding-window consecutive limits ($\sum_{k=t}^{t+\text{maxConsecutive}} a_k \le \text{maxConsecutive}$); maximize $\sum_d (\pi_d - \text{shiftCosts}[d]) a_d$ and propose the pattern when $\text{baseCost} - \text{sub.objectiveValue!} < -10^{-5}$.
