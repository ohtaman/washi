# #023. Positive-Part Overtime Staffing

<!-- section:scenario -->
A service center operations manager is planning regular working hours (in person-hours) across multiple periods to cover forecasted demand (in person-hours).

The schedule must satisfy all of the following conditions:
- **Per-period bounds**: Each period enforces a contractual minimum regular hours floor and a staffing capacity limit.
- **Aggregate cap**: Total regular hours across the entire horizon cannot exceed an overall cap.
- **Shortfall-only penalty**: Whenever regular hours fall short of a period's demand, the shortfall incurs an overtime/subcontracting penalty (in JPY) per person-hour (exceeding demand receives no refund or positive credit).

Find the schedule that satisfies all conditions while **minimizing the sum of regular operating cost and overtime penalties (in JPY)**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Demand $d_t$ in period $t$ (person-hours) |
| `minRegular` | `number[]` | Minimum guaranteed regular hours in period $t$ (person-hours) |
| `maxRegular` | `number[]` | Maximum regular hours in period $t$ (person-hours) |
| `regularCosts` | `number[]` | Unit regular operating cost in period $t$ (JPY/person-hour) |
| `overtimePenalties` | `number[]` | Overtime penalty per person-hour of unmet demand in period $t$ (JPY/person-hour) |
| `totalRegularCap` | `number` | Aggregate cap on total regular hours across all periods (person-hours) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `regular` | `number[]` | Regular hours $x_t$ in each period (person-hours) |
| `shortage` | `number[]` | Overtime shortfall hours $\max(0, d_t - x_t)$ in each period (person-hours) |
| `totalCost` | `number` | Minimized total cost (JPY) |

<!-- section:example -->
**Input**

```json
{
  "demands": [40, 60, 50],
  "minRegular": [10, 10, 10],
  "maxRegular": [50, 50, 50],
  "regularCosts": [20, 25, 18],
  "overtimePenalties": [50, 45, 55],
  "totalRegularCap": 100
}
```

**Output**

```json
{
  "regular": [40, 10, 50],
  "shortage": [0, 50, 0],
  "totalCost": 4200
}
```

Regular hours [40, 10, 50] sum to $100 \le 100$ person-hours within per-period bounds, leaving shortages [0, 50, 0] and yielding a total cost of $(20 \times 40 + 25 \times 10 + 18 \times 50) + (45 \times 50) =$ **4,200** JPY.


<!-- section:hint1 -->
Declare a continuous regular-hours variable for each period bounded by its minimum guaranteed hours and maximum regular hours, along with a non-negative continuous shortage variable for each period representing unmet demand covered by overtime.

<!-- section:hint2 -->
Linearize the positive-part shortfall $\max(0, d_t - x_t)$—where $d_t$ is demand, $x_t$ is regular hours, and $s_t$ is the shortfall—with an inequality $s_t \ge d_t - x_t$ alongside $s_t \ge 0$, rather than an equality. Using equality would force $s_t < 0$ and make the problem infeasible whenever regular hours exceed demand (for example due to a period's minimum floor). Also check the sign carefully ($d_t - x_t$, not $x_t - d_t$), and remember the aggregate cap on total regular hours across all periods. Because overtime penalties are positive and we minimize total cost, each $s_t$ settles tightly at $\max(0, d_t - x_t)$.