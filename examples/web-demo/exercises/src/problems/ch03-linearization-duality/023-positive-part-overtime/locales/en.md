# #023. Positive-Part Overtime Staffing

<!-- section:scenario -->
A service center plans regular capacity across multiple periods to cover forecasted demand. Each period enforces a minimum guaranteed regular level and a maximum capacity limit, while total regular output across the whole horizon cannot exceed an aggregate regular hours budget.

Whenever regular output falls short of period demand, the unmet portion incurs an overtime or subcontracting penalty per unit; excess regular output above demand receives no credit or refund. Choose the regular staffing levels to **minimize total regular plus overtime cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Required workload $d_t$ in period $t$ |
| `minRegular` | `number[]` | Minimum guaranteed regular level $L_t$ |
| `maxRegular` | `number[]` | Maximum regular capacity $U_t$ |
| `regularCosts` | `number[]` | Unit regular cost $r_t$ in period $t$ |
| `overtimePenalties` | `number[]` | Overtime cost $p_t$ per unit of unmet demand $\max(0, d_t - x_t)$ |
| `totalRegularCap` | `number` | Aggregate cap on $\sum_t x_t$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `regular` | `number[]` | Regular capacity $x_t$ scheduled in each period |
| `shortage` | `number[]` | Unmet demand $\max(0, d_t - x_t)$ covered by overtime |
| `totalCost` | `number` | Minimized total cost |

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

Scheduling `regular = [40, 10, 50]` sums to $100 \le 100$ within per-period bounds, leaves shortages `[0, 50, 0]`, and yields total cost $(20 \times 40 + 25 \times 10 + 18 \times 50) + (45 \times 50) =$ **4,200**.


<!-- section:hint1 -->
Declare a continuous regular-capacity variable for each period bounded by its minimum guaranteed level and maximum capacity, and a non-negative continuous shortage variable for each period representing unmet demand covered by overtime.

<!-- section:hint2 -->
Linearize the one-sided hinge $\max(0, d_t - x_t)$ with an inequality $s_t \ge d_t - x_t$ alongside $s_t \ge 0$, rather than an equality—using equality would force $s_t < 0$ and make the problem infeasible whenever regular capacity exceeds demand (for example due to a period's minimum floor). Also check the sign carefully ($d_t - x_t$, not $x_t - d_t$), and remember the aggregate cap on total regular output across all periods. Because overtime penalties are positive and we minimize total cost, each $s_t$ settles tightly at $\max(0, d_t - x_t)$.