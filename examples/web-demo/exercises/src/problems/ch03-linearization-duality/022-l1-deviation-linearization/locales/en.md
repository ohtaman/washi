# #022. Weighted L1 Target Tracking

<!-- section:scenario -->
A power utility operator is deciding the power generation allocations (in MW) across multiple generating units (thermal, gas, hydro, etc.). The schedule must satisfy three conditions:
- **Per-unit bounds**: Each generating unit's output must be non-negative and within its rated upper limit.
- **Budget cap**: Total generation cost (in 10k JPY) must stay within the budget.
- **Total output**: Total output across all units must exactly match the required total output (in MW).

Because individual target outputs may conflict with the budget or total output requirement, some units must be adjusted upward or downward. Each MW of deviation above or below a generating unit's target incurs its assigned penalty weight. Find the output allocations that satisfy all constraints while **minimizing the weighted sum of absolute deviations from target (weighted L1 deviation)**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `targets` | `number[]` | Target output $\tau_i$ for generating unit $i$ (MW) |
| `weights` | `number[]` | Positive penalty weight $w_i$ per MW of deviation from target |
| `upperBounds` | `number[]` | Rated upper output limit for generating unit $i$ (MW) |
| `costs` | `number[]` | Unit generation cost for generating unit $i$ (10k JPY/MW) |
| `budget` | `number` | Maximum allowable total cost (10k JPY) |
| `totalOutput` | `number` | Required total output (MW) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `allocations` | `number[]` | Output allocation $x_i$ for each generating unit (MW) |
| `totalDeviation` | `number` | Minimized weighted L1 deviation $\sum_i w_i \lvert x_i - \tau_i \rvert$ |

<!-- section:example -->
**Input**

```json
{
  "targets": [40, 30, 30],
  "weights": [3, 2, 1],
  "upperBounds": [60, 60, 60],
  "costs": [5, 2, 1],
  "budget": 230,
  "totalOutput": 100
}
```

**Output**

```json
{
  "allocations": [25, 30, 45],
  "totalDeviation": 60
}
```

Allocations [25, 30, 45] sum to 100 MW, incur a total cost of $5 \times 25 + 2 \times 30 + 1 \times 45 = 230 \le 230$ (10k JPY), and give a weighted L1 deviation of $3 \lvert 25 - 40 \rvert + 2 \lvert 30 - 30 \rvert + 1 \lvert 45 - 30 \rvert =$ **60**.


<!-- section:hint1 -->
Declare a continuous output variable for each generating unit bounded between 0 and its upper limit. To linearize absolute deviations without binary variables, also introduce a pair of non-negative auxiliary variables per generating unit representing the positive overshoot above target and the negative shortfall below target.

<!-- section:hint2 -->
Express each generating unit's signed deviation from its target as the difference between its overshoot and shortfall variables, and penalize their sum in the objective. Because penalty weights are positive, at least one of the two auxiliary variables vanishes automatically at optimality, linearizing the absolute value without binary variables.