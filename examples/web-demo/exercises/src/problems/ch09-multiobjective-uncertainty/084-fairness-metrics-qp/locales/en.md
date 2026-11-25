# #084. Fair Resource Allocation via Convex QP

<!-- section:scenario -->
An operations manager at a distribution center must allocate a fixed total workload (in tons) in continuous quantities across several delivery teams. Each team has an operating cost per ton as well as minimum and maximum allocation bounds (in tons), and the sum of all team allocations must equal the total demand.

To balance the workload across teams, minimize the total cost consisting of the linear operating cost per ton plus a quadratic penalty (L2 fairness penalty) proportional to the sum of squared deviations from the mean allocation.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `unitCosts` | `number[]` | Operating cost per ton for each team |
| `minAlloc` | `number[]` | Minimum required allocation for each team (tons) |
| `maxAlloc` | `number[]` | Maximum allowed allocation for each team (tons) |
| `totalDemand` | `number` | Exact total demand to distribute across all teams (tons) |
| `fairnessWeight` | `number` | Non-negative weight on the sum of squared deviations from the mean allocation |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `allocations` | `number[]` | Allocation assigned to each team (non-negative real values, tons) |
| `totalCost` | `number` | Minimized sum of linear cost and quadratic fairness penalty |

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