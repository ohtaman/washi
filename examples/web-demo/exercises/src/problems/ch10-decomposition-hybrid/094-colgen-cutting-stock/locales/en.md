# #094. Cutting Stock via Column Generation

<!-- section:scenario -->
A paper mill cuts standard stock rolls of fixed width into smaller item widths to satisfy customer demands while minimizing the total number of stock rolls consumed. Because the number of valid cutting patterns grows combinatorially with item types, enumerating every pattern upfront does not scale.

Starting from a small initial set of cutting patterns, use WaSHI column generation to dynamically discover improving patterns and finalize an integer cutting plan that minimizes total stock rolls consumed.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `rollWidth` | `number` | Width of each uncut standard stock roll |
| `widths` | `number[]` | Width of each requested item type $i$ |
| `demands` | `number[]` | Minimum required count of each item type $i$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `patterns` | `number[][]` | Selected cutting patterns (`patterns.length === counts.length`), where `patterns[p][i]` is the non-negative integer count of item $i$ cut per roll in pattern $p$ |
| `counts` | `number[]` | Non-negative integer roll counts used for each selected pattern |
| `totalRolls` | `number` | Total number of stock rolls consumed (`sum(counts)`) |

<!-- section:example -->
**Input**

```json
{
  "rollWidth": 100,
  "widths": [45, 36, 16],
  "demands": [10, 14, 20]
}
```

**Output**

```json
{
  "patterns": [
    [0, 2, 1],
    [1, 1, 1],
    [0, 1, 4]
  ],
  "counts": [1, 10, 3],
  "totalRolls": 14
}
```

Each pattern fits within 100 ($88, 97, 100 \le 100$), producing `[10, 15, 23] >= [10, 14, 20]` items across $1 + 10 + 3 =$ **14** stock rolls.

<!-- section:hint1 -->
Decompose into a Restricted Master Problem (choosing how many rolls to cut of each active pattern to cover item demands) and a bounded knapsack pricing subproblem (generating a new valid pattern within `rollWidth` that reduces the master objective). Seed the master with simple feasible single-item patterns so its initial LP is always feasible.

<!-- section:hint2 -->
Build the master with named `demand_${i}` constraints and `master.column(...)` variables of unit cost 1, then call `solveColumnGeneration({ master, finalizeAsMIP: true, pricing })`. Inside `pricing({ getDual })`, maximize $\sum_i \pi_i a_i$ subject to $\sum_i w_i a_i \le W$ with integer $a_i \in [0, \lfloor W / w_i \rfloor]$; propose the new column whenever its reduced cost $1 - \sum_i \pi_i a_i < -10^{-5}$.
