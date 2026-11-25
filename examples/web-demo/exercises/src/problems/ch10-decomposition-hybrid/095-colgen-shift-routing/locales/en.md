# #095. Shift Rostering via Column Generation

<!-- section:scenario -->
Schedule shifts for identical-skill call center staff across a multi-day planning horizon to meet the minimum daily staffing requirements. Each hired worker follows a shift pattern subject to three rules:

- **Cost**: incurs a fixed base cost plus a daily wage for each day worked.
- **Total work days**: works at least 1 day and at most `maxWorkDays` days in total.
- **Consecutive limit**: works at most `maxConsecutive` consecutive days without a day off.

Starting from a small initial set of shift patterns, use WaSHI column generation to dynamically discover legal multi-day shift patterns and finalize an integer schedule that minimizes total staffing cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Minimum required staff count on each day $d$ |
| `shiftCosts` | `number[]` | Daily variable wage incurred per worker working on day $d$ |
| `baseCost` | `number` | Fixed base cost per hired worker |
| `maxConsecutive` | `number` | Maximum consecutive active work days allowed in any shift pattern |
| `maxWorkDays` | `number` | Maximum total work days allowed in any shift pattern |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selectedColumns` | `number[][]` | Selected shift patterns (each a 0/1 vector of length `demands.length`) |
| `counts` | `number[]` | Non-negative integer headcount assigned to each selected shift pattern |
| `totalCost` | `number` | Total staffing cost across all selected shift patterns (fixed base costs plus daily wages) |

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

Each pattern works at most 4 days with at most 3 consecutive days, covers daily demands `[2, 3, 4, 3, 2]`, and costs $1 \times 71 + 2 \times 56 + 1 \times 71 =$ **254**.

<!-- section:hint1 -->
Decompose into a Restricted Master Problem (selecting headcounts for generated shift patterns to cover daily demands) and a binary MIP pricing subproblem (generating a single legal multi-day shift pattern). Seed the master with single-day starter columns for days with positive demand so the initial LP is always feasible.

<!-- section:hint2 -->
Call `solveColumnGeneration({ master, finalizeAsMIP: true, pricing })` with `demand_${d}` constraints. In `pricing({ getDual })`, model a binary vector $a_d \in \{0,1\}$ enforcing $1 \le \sum_d a_d \le \text{maxWorkDays}$ and sliding-window consecutive limits ($\sum_{k=t}^{t+\text{maxConsecutive}} a_k \le \text{maxConsecutive}$); maximize $z_{\text{sub}} = \sum_d (\pi_d - \text{shiftCosts}[d]) a_d$ and propose the pattern when $\text{baseCost} - z_{\text{sub}} < -10^{-5}$.
