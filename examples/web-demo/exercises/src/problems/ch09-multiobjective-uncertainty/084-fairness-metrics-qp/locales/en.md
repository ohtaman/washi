# #084. Fair Resource Allocation via Convex QP

<!-- section:scenario -->
An operations manager distributes an exact total workload across several regional teams. Each team has its own per-unit operating cost as well as minimum and maximum allowable workload bounds, and the sum of all team allocations must equal the total demand.

Pure cost minimization concentrates work on the cheapest teams up to their capacity limits. To promote workload equity, add a quadratic fairness penalty proportional to the sum of squared deviations from the mean allocation, and **minimize linear operating cost plus the L2 fairness penalty**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `unitCosts` | `number[]` | Linear operating cost per unit allocated to each team |
| `minAlloc` | `number[]` | Minimum required allocation for each team |
| `maxAlloc` | `number[]` | Maximum allowed allocation for each team |
| `totalDemand` | `number` | Exact total workload to distribute across all teams |
| `fairnessWeight` | `number` | Non-negative penalty weight $\lambda$ on $\sum_i (x_i - \bar{x})^2$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `allocations` | `number[]` | Continuous fair allocation assigned to each team |
| `totalCost` | `number` | Minimized sum of linear cost and quadratic variance penalty |

<!-- section:example -->
**Input**

```json
{
  "unitCosts": [10, 2, 6],
  "minAlloc": [0, 0, 0],
  "maxAlloc": [20, 20, 20],
  "totalDemand": 30,
  "fairnessWeight": 2
}
```

**Output**

```json
{
  "allocations": [9, 11, 10],
  "totalCost": 176
}
```

With `allocations = [9, 11, 10]`, total demand is $9 + 11 + 10 = 30$ (mean $\bar{x} = 10$), linear cost is $10(9) + 2(11) + 6(10) = 172$, and the variance penalty is $2 \times ((9 - 10)^2 + (11 - 10)^2 + (10 - 10)^2) = 4$, giving total objective **176**.


<!-- section:hint1 -->
Model one bounded continuous workload decision per team so that total demand is satisfied while balancing linear operating cost against variance across teams.

<!-- section:hint2 -->
Because total demand is fixed, the target mean allocation is a known constant rather than a decision-dependent expression. WaSHI's `expr` template tag natively compiles convex quadratic terms for HiGHS QP without manual piecewise linearization, and `m.objectiveValue!` includes any constant offset from expanding the squared deviations.