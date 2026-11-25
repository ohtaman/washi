# #028. LP Reduced Costs & Entry Thresholds

<!-- section:scenario -->
A chemical plant production planner is creating a cost-minimizing blending plan across multiple chemical processes, deciding each process's operating level (non-negative continuous quantity in tons) to satisfy all minimum production requirements. Each process has a unit cost (per ton) and contributes to every minimum production requirement at process-specific per-ton rates; under current unit costs, some processes are uneconomical and stay at 0 in the optimal plan.

Operations asks: "For each unused process, at what marginal rate (per ton) would minimum total cost increase if we forced it to run—or equivalently, by how much would its unit cost need to drop for it to be adopted?" Solve the minimization LP and return each process's operating level, reduced cost, and the minimum total cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `costs` | `number[]` | Unit cost for each process (per ton) |
| `yields` | `number[][]` | Output yield matrix indexed as `[requirement][process]` (contribution per ton) |
| `minRequirements` | `number[]` | Minimum production target for each requirement |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `quantities` | `number[]` | Optimal non-negative operating level for each process (tons) |
| `reducedCosts` | `number[]` | Reduced cost $\bar{c}_j$ for each process (per ton) |
| `optimalCost` | `number` | Minimized total cost $z^*$ |

<!-- section:example -->
**Input**

```json
{
  "costs": [10, 14, 24, 30],
  "yields": [
    [1, 2, 2, 3],
    [2, 1, 3, 1]
  ],
  "minRequirements": [17, 16]
}
```

**Output**

```json
{
  "quantities": [5, 6, 0, 0],
  "reducedCosts": [0, 0, 6, 10],
  "optimalCost": 134
}
```

Using `quantities` = [5, 6, 0, 0] meets [17, 16] at cost $10 \times 5 + 14 \times 6 =$ **134**, while the dual values [6, 2] yield reduced costs $24 - (6 \times 2 + 2 \times 3) = 6$ and $30 - (6 \times 3 + 2 \times 1) = 10$ for the two unused processes.


<!-- section:hint1 -->
Introduce one non-negative continuous decision variable per process representing how much of that process to run.

<!-- section:hint2 -->
After solving the LP, read each variable's reduced cost via `v.reducedCost!` in WaSHI (or `v.dj` in PuLP). Do not return raw unit costs as-is or manually negate the reduced costs: in a minimization LP with non-negative variables, active (basic) variables in the optimal basis ($x_j > 0$) have reduced cost 0, while unused variables at their lower bound have non-negative reduced costs measuring the cost improvement needed to enter the basis. Return the solver's exact values without rounding to integers.